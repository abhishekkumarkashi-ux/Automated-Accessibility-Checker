process.env.UV_THREADPOOL_SIZE = '64';

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium, type Browser, type Page } from 'playwright';
import type { AxeResults, Result } from 'axe-core';
import { ScanError, validatePublicDestination, validateUrlSyntax } from './safety.js';
import { scanStore } from './agent/scanStore.js';
import { isFoundryConfigured, getFoundryConfig, generateActionPlan } from './agent/foundryAgent.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 32_000);
const scanTimeoutMs = Number(process.env.SCAN_TIMEOUT_MS ?? 28_000);
const navigationTimeoutMs = Number(process.env.NAVIGATION_TIMEOUT_MS ?? 18_000);
const maxRedirects = 8;
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const demoPath = path.join(serverDirectory, 'demo.html');
const productionDemoPath = path.resolve(serverDirectory, '../../server/demo.html');
const axePath = path.dirname(fileURLToPath(import.meta.resolve('axe-core')));
const axeScript = path.join(axePath, 'axe.min.js');

app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));

type ScanCategory = 'violations' | 'passes' | 'incomplete';
type ScanResultItem = Pick<Result, 'id' | 'impact' | 'description' | 'help' | 'helpUrl' | 'tags' | 'nodes'>;

interface AuditScore {
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  rating: string;
  complianceRate: number;
  totalEvaluated: number;
  affectedElements: number;
  impacts: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
}

interface ScanResponse {
  scanId?: string;
  scannedUrl: string;
  scannedAt: string;
  counts: Record<ScanCategory, number>;
  violations: ScanResultItem[];
  passes: ScanResultItem[];
  incomplete: ScanResultItem[];
  source: 'website' | 'demo';
  score: AuditScore;
}

function calculateScore(violations: Result[], passesCount: number): AuditScore {
  const impacts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let affectedElements = 0;

  for (const v of violations) {
    affectedElements += (v.nodes?.length ?? 0);
    const imp = (v.impact?.toLowerCase() ?? 'minor') as keyof typeof impacts;
    if (imp in impacts) {
      impacts[imp]++;
    } else {
      impacts.minor++;
    }
  }

  const totalEvaluated = passesCount + violations.length;
  const complianceRate = totalEvaluated > 0 ? Math.round((passesCount / totalEvaluated) * 100) : 100;

  const earned = passesCount * 10;
  const violationPoints =
    impacts.critical * 10 +
    impacts.serious * 7 +
    impacts.moderate * 4 +
    impacts.minor * 2;

  const totalPossible = earned + violationPoints;
  const score = totalPossible > 0 ? Math.round((earned / totalPossible) * 100) : 100;

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  let rating: string;

  if (score >= 98 && violations.length === 0) {
    grade = 'A+';
    rating = 'Excellent';
  } else if (score >= 90) {
    grade = 'A';
    rating = 'Very Good';
  } else if (score >= 80) {
    grade = 'B';
    rating = 'Good';
  } else if (score >= 70) {
    grade = 'C';
    rating = 'Needs Attention';
  } else if (score >= 60) {
    grade = 'D';
    rating = 'Substandard';
  } else {
    grade = 'F';
    rating = 'Critical Action Required';
  }

  return {
    score,
    grade,
    rating,
    complianceRate,
    totalEvaluated,
    affectedElements,
    impacts,
  };
}

/**
 * Prepares results for API response. Limits nodes per rule to 50 and trims large HTML snippets
 * so large pages (e.g. YouTube, NASA) do not produce 20MB JSON payloads that freeze browsers.
 */
function resultItems(items: Result[]): ScanResultItem[] {
  return items.map(({ id, impact, description, help, helpUrl, tags, nodes }) => {
    const maxNodesToInclude = 50;
    const trimmedNodes = nodes.slice(0, maxNodesToInclude).map(({ any, all, none, failureSummary, html, target, impact: nodeImpact }) => ({
      any,
      all,
      none,
      failureSummary,
      html: html.length > 500 ? html.slice(0, 497) + '...' : html,
      target,
      impact: nodeImpact,
    }));

    return {
      id,
      impact,
      description,
      help,
      helpUrl,
      tags,
      nodes: trimmedNodes,
    };
  });
}

function toResponse(results: AxeResults, scannedUrl: string, source: ScanResponse['source']): ScanResponse {
  // Score is calculated from full axe results before node trimming to preserve full accuracy
  const score = calculateScore(results.violations, results.passes.length);
  const violations = resultItems(results.violations);
  const passes = resultItems(results.passes);
  const incomplete = resultItems(results.incomplete);

  return {
    scannedUrl,
    scannedAt: new Date().toISOString(),
    counts: { violations: violations.length, passes: passes.length, incomplete: incomplete.length },
    violations,
    passes,
    incomplete,
    source,
    score,
  };
}

async function protectBrowser(page: Page): Promise<() => ScanError | undefined> {
  let mainNavigations = 0;
  let blockedNavigation: ScanError | undefined;

  await page.route('**/*', async (route) => {
    const request = route.request();
    const rawUrl = request.url();
    const resourceType = request.resourceType();

    // Allow in-memory data: and blob: URLs without network/DNS checks
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
      await route.continue();
      return;
    }

    // Abort media and heavy streaming/tracking to save bandwidth, CPU, and prevent hangs on YouTube/NASA/college portals
    if (
      resourceType === 'media' ||
      rawUrl.includes('videoplayback') ||
      rawUrl.includes('googlevideo.com') ||
      rawUrl.includes('doubleclick.net') ||
      rawUrl.includes('googleads') ||
      rawUrl.includes('google-analytics.com') ||
      rawUrl.includes('googletagmanager.com') ||
      rawUrl.includes('analytics.') ||
      rawUrl.includes('hotjar.com') ||
      rawUrl.includes('clarity.ms') ||
      rawUrl.includes('facebook.net') ||
      rawUrl.includes('nopaperforms') ||
      rawUrl.includes('npfs.co') ||
      rawUrl.includes('criteo.') ||
      rawUrl.includes('leadsq') ||
      rawUrl.includes('tawk.to') ||
      rawUrl.includes('intercom.io')
    ) {
      await route.abort('blockedbyclient').catch(() => undefined);
      return;
    }

    let target: URL;
    try {
      target = new URL(rawUrl);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }

      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        mainNavigations += 1;
        if (mainNavigations > maxRedirects + 1) {
          blockedNavigation = new ScanError(
            'The page redirected too many times in a loop. Check the URL and try again.',
            400,
            'REDIRECT_LOOP'
          );
          await route.abort('blockedbyclient').catch(() => undefined);
          return;
        }
        // Full destination check for main page navigation
        const validated = validateUrlSyntax(rawUrl);
        await validatePublicDestination(validated);
      }

      await route.continue();
    } catch (error) {
      await route.abort('blockedbyclient').catch(() => undefined);
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        blockedNavigation =
          error instanceof ScanError
            ? error
            : new ScanError('The website tried to navigate to a blocked address.', 400, 'BLOCKED_ACCESS');
      }
    }
  });

  // WebSockets bypass ordinary HTTP route interception; disable them in the untrusted page
  await page.addInitScript(() => {
    Object.defineProperty(window, 'WebSocket', {
      configurable: false,
      writable: false,
      value: class BlockedWebSocket {
        constructor() {
          throw new DOMException('WebSocket connections are disabled during this scan.', 'SecurityError');
        }
      },
    });
  });

  return () => blockedNavigation;
}

let cachedAxeSource: string | null = null;
async function getAxeSource(): Promise<string> {
  if (!cachedAxeSource) {
    cachedAxeSource = await readFile(axeScript, 'utf8');
  }
  return cachedAxeSource;
}

async function runAxe(page: Page): Promise<AxeResults> {
  const source = await getAxeSource();

  // Inject axe source into page; fallback to script tag if page.evaluate is blocked
  try {
    await page.evaluate(source);
  } catch {
    try {
      await page.addScriptTag({ content: source });
    } catch {
      throw new ScanError(
        'Could not initialize accessibility analysis engine in the webpage.',
        500,
        'ENGINE_INIT_FAILED',
        'The target website may have strict security settings preventing automated analysis scripts.'
      );
    }
  }

  try {
    return await page.evaluate(async () => {
      const axeApi = (window as Window & {
        axe?: { run: (context?: unknown, options?: unknown) => Promise<AxeResults> };
      }).axe;
      if (!axeApi) throw new Error('axe-core was not found on window object.');
      return axeApi.run(document, {
        iframes: false,
        elementRef: false,
        resultTypes: ['violations', 'passes', 'incomplete'],
      });
    });
  } catch (evalError: unknown) {
    const msg = evalError instanceof Error ? evalError.message : String(evalError);
    if (/execution context was destroyed/i.test(msg)) {
      throw new ScanError(
        'The webpage navigated away or reloaded while the audit was running.',
        502,
        'NAVIGATION_INTERRUPTED',
        'Try scanning a specific, static page instead of a dynamic dashboard or login redirect.'
      );
    }
    if (/timeout/i.test(msg)) {
      throw new ScanError(
        'Accessibility evaluation timed out on this large webpage.',
        504,
        'TIMEOUT',
        'This page is exceptionally large. Try scanning a specific subpage.'
      );
    }
    throw new ScanError(
      `Accessibility analysis failed: ${msg}`,
      500,
      'SCAN_FAILED'
    );
  }
}

async function scanWebsite(url: URL): Promise<ScanResponse> {
  let browser: Browser | undefined;
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    void browser?.close().catch(() => undefined);
  }, scanTimeoutMs);

  try {
    await validatePublicDestination(url);

    browser = await chromium.launch({
      headless: true,
      timeout: 20_000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--mute-audio',
        '--disable-blink-features=AutomationControlled',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
      ],
    });

    const context = await browser.newContext({
      serviceWorkers: 'block',
      ignoreHTTPSErrors: true,
      bypassCSP: true,
      javaScriptEnabled: true,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Sec-Ch-Ua': '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
      },
    });

    // Provide pre-approved Google/YouTube consent cookie to bypass consent interstitials
    await context.addCookies([
      {
        name: 'SOCS',
        value: 'CAESEwgDEgk2MTQ5MDU3MDQaAmVuIAEaBgiA_LuuBg',
        domain: '.youtube.com',
        path: '/',
      },
      {
        name: 'SOCS',
        value: 'CAESEwgDEgk2MTQ5MDU3MDQaAmVuIAEaBgiA_LuuBg',
        domain: '.google.com',
        path: '/',
      },
    ]).catch(() => undefined);

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(navigationTimeoutMs);
    page.setDefaultTimeout(25_000);

    // Mask webdriver and bypass Trusted Types restrictions safely
    await page.addInitScript(() => {
      // Mask webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Provide mock window.chrome
      if (!(window as unknown as { chrome?: unknown }).chrome) {
        (window as unknown as { chrome: unknown }).chrome = { runtime: {}, loadTimes: () => {}, app: {} };
      }

      // Bypass Trusted Types on strict CSP websites (e.g. YouTube)
      const win = window as unknown as {
        trustedTypes?: { createPolicy: (name: string, rules: Record<string, (s: string) => string>) => void };
      };
      if (win.trustedTypes && win.trustedTypes.createPolicy) {
        try {
          win.trustedTypes.createPolicy('default', {
            createHTML: (s: string) => s,
            createScript: (s: string) => s,
            createScriptURL: (s: string) => s,
          });
        } catch {
          // Ignore if policy already exists
        }
      }
    });

    const getBlockedNavigation = await protectBrowser(page);

    let navResponse = null;
    try {
      navResponse = await page.goto(url.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: navigationTimeoutMs,
      });
      // Brief pause for initial DOM hydration on modern SPAs
      await page.waitForTimeout(1000);
    } catch (error) {
      const blockedNavigation = getBlockedNavigation();
      if (blockedNavigation) throw blockedNavigation;
      if (error instanceof ScanError) throw error;

      // Check if page partially loaded HTML body despite timeout
      const hasContent = await page.evaluate(() => Boolean(document.body && document.body.children.length > 0)).catch(() => false);
      if (!hasContent) {
        const message = error instanceof Error ? error.message : String(error);
        if (/ERR_NAME_NOT_RESOLVED/i.test(message)) {
          throw new ScanError(
            `Could not find website host "${url.hostname}". Check for typos in the address.`,
            400,
            'DNS_FAILED',
            'Verify that the domain name is spelled correctly and is active.'
          );
        }
        if (/ERR_CONNECTION_REFUSED/i.test(message)) {
          throw new ScanError(
            `The server at "${url.hostname}" refused the connection. The service may be offline.`,
            502,
            'SERVER_ERROR',
            'Check if the server is online and accepting public web requests.'
          );
        }
        if (/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED/i.test(message)) {
          throw new ScanError(
            `The connection to "${url.hostname}" was unexpectedly closed or reset.`,
            502,
            'SERVER_ERROR',
            'The remote host reset the connection. Please try again in a few moments.'
          );
        }
        if (/ERR_CERT_|CERT_/i.test(message)) {
          throw new ScanError(
            `The SSL/TLS security certificate for "${url.hostname}" could not be verified.`,
            502,
            'SECURITY_ERROR',
            'The website certificate may be expired, untrusted, or misconfigured.'
          );
        }
        if (/ERR_TOO_MANY_REDIRECTS/i.test(message)) {
          throw new ScanError(
            `The website at "${url.hostname}" has an infinite redirect loop.`,
            400,
            'REDIRECT_LOOP'
          );
        }
        if (/timeout/i.test(message)) {
          throw new ScanError(
            `The page took too long to load (${Math.round(navigationTimeoutMs / 1000)}s timeout exceeded).`,
            504,
            'TIMEOUT',
            'Large websites may have slow external trackers. Try a faster or more specific subpage.'
          );
        }
        throw new ScanError(
          `The page could not be loaded: ${message}`,
          502,
          'LOAD_FAILED',
          'Make sure the website is public and currently operational.'
        );
      }
    }

    // Inspect HTTP status codes
    if (navResponse) {
      const status = navResponse.status();
      if (status === 404) {
        throw new ScanError(
          `The page at "${url.toString()}" was not found (HTTP 404 Not Found).`,
          404,
          'NOT_FOUND',
          'Check that the URL path is spelled correctly and the page exists.'
        );
      }
      if (status === 401 || status === 403) {
        throw new ScanError(
          `Access was denied by "${url.hostname}" (HTTP ${status} Forbidden).`,
          403,
          'ACCESS_DENIED',
          'This website restricts automated scanning tools (bot protection) or requires authentication.'
        );
      }
      if (status >= 500) {
        throw new ScanError(
          `The website server at "${url.hostname}" returned an error (HTTP ${status}).`,
          502,
          'SERVER_ERROR',
          'The remote server is experiencing internal issues. Try again later.'
        );
      }
    }

    const results = await runAxe(page);
    return toResponse(results, page.url(), 'website');
  } catch (error) {
    if (timedOut) {
      throw new ScanError(
        `The scan exceeded the time limit (${Math.round(scanTimeoutMs / 1000)}s). Try a simpler or faster page.`,
        504,
        'TIMEOUT'
      );
    }
    throw error;
  } finally {
    clearTimeout(watchdog);
    if (browser) await browser.close().catch(() => undefined);
  }
}

async function scanDemo(): Promise<ScanResponse> {
  let browser: Browser | undefined;
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    void browser?.close().catch(() => undefined);
  }, scanTimeoutMs);

  try {
    browser = await chromium.launch({
      headless: true,
      timeout: 10_000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    let fixture: string;
    try {
      fixture = await readFile(demoPath, 'utf8');
    } catch {
      try {
        fixture = await readFile(productionDemoPath, 'utf8');
      } catch {
        fixture = await readFile(path.resolve(process.cwd(), 'server/demo.html'), 'utf8');
      }
    }
    await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
    const results = await runAxe(page);
    return toResponse(results, 'Local demo fixture (no external website fetched)', 'demo');
  } catch (error) {
    if (timedOut) throw new ScanError('The demo scan exceeded its time limit. Please try again.', 504, 'TIMEOUT');
    throw error;
  } finally {
    clearTimeout(watchdog);
    if (browser) await browser.close().catch(() => undefined);
  }
}

app.get('/api/health', (_request, response) => response.json({ ok: true }));

app.get('/api/agent/status', (_request, response) => {
  const configured = isFoundryConfigured();
  const config = getFoundryConfig();
  response.json({
    configured,
    model: configured && config ? config.model : undefined,
  });
});

app.post('/api/agent/plan', async (request, response) => {
  try {
    const scanId = request.body?.scanId;
    if (typeof scanId !== 'string' || !scanId.trim()) {
      return response.status(400).json({
        error: 'A valid scanId must be provided in the request body.',
        code: 'INVALID_SCAN_ID',
      });
    }

    if (!isFoundryConfigured()) {
      return response.status(503).json({
        error: 'Microsoft Foundry Agent Service is not configured on this server.',
        code: 'AGENT_NOT_CONFIGURED',
        suggestion:
          'Set AZURE_AI_FOUNDRY_PROJECT_ENDPOINT and AZURE_AI_FOUNDRY_MODEL_DEPLOYMENT in .env to enable the Accessibility Coach Agent.',
      });
    }

    const plan = await generateActionPlan(scanId.trim());
    response.json(plan);
  } catch (error) {
    console.error('Agent plan error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate accessibility remediation plan.';
    const status = message.includes('not found') || message.includes('expired') ? 404 : 500;
    response.status(status).json({
      error: message,
      code: 'AGENT_ERROR',
    });
  }
});

app.post('/api/scan', async (request, response) => {
  try {
    const url = validateUrlSyntax(request.body?.url);
    const scanResult = await scanWebsite(url);
    const scanId = scanStore.store(scanResult);
    response.json({ ...scanResult, scanId });
  } catch (error) {
    console.error('Scan error:', error);
    const known = error instanceof ScanError;
    const status = known ? error.status : 500;
    const message = known
      ? error.message
      : error instanceof Error
        ? error.message
        : 'The scan could not be completed. Please try again.';
    const code = known ? error.code : 'SERVER_ERROR';
    const suggestion = known ? error.suggestion : 'Please verify the URL and try again.';

    response.status(status).json({
      error: message,
      code,
      suggestion,
      status,
    });
  }
});

app.post('/api/demo', async (_request, response) => {
  try {
    const scanResult = await scanDemo();
    const scanId = scanStore.store(scanResult);
    response.json({ ...scanResult, scanId });
  } catch (error) {
    const known = error instanceof ScanError;
    const status = known ? error.status : 500;
    response.status(status).json({
      error: known ? error.message : 'The local demo scan could not be completed. Please try again.',
      code: known ? error.code : 'DEMO_ERROR',
      status,
    });
  }
});

// Serve frontend static assets in production
const clientDist = path.resolve(process.cwd(), 'dist');
app.use(express.static(clientDist));

app.use((request, response, next) => {
  if (request.method !== 'GET' || request.path.startsWith('/api')) {
    return next();
  }
  response.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    response.status(400).json({ error: 'The request body must be valid JSON.', code: 'INVALID_JSON' });
    return;
  }
  response.status(500).json({ error: 'The server could not complete that request.', code: 'INTERNAL_ERROR' });
});

const host = process.env.HOST ?? '0.0.0.0';
const server = app.listen(port, host, () => {
  console.log(`AccessScan listening on http://${host}:${port}`);
});
server.requestTimeout = requestTimeoutMs;
server.headersTimeout = requestTimeoutMs + 1000;

