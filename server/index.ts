import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium, type Browser, type Page } from 'playwright';
import type { AxeResults, Result } from 'axe-core';
import { ScanError, validatePublicDestination, validateUrlSyntax } from './safety.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const requestTimeoutMs = 30_000;
const scanTimeoutMs = 25_000;
const navigationTimeoutMs = 20_000;
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
  scannedUrl: string;
  scannedAt: string;
  counts: Record<ScanCategory, number>;
  violations: ScanResultItem[];
  passes: ScanResultItem[];
  incomplete: ScanResultItem[];
  source: 'website' | 'demo';
  score: AuditScore;
}

function calculateScore(violations: ScanResultItem[], passes: ScanResultItem[]): AuditScore {
  const impacts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let affectedElements = 0;

  for (const v of violations) {
    affectedElements += v.nodes.length;
    const imp = (v.impact?.toLowerCase() ?? 'minor') as keyof typeof impacts;
    if (imp in impacts) {
      impacts[imp]++;
    } else {
      impacts.minor++;
    }
  }

  const totalEvaluated = passes.length + violations.length;
  const complianceRate = totalEvaluated > 0 ? Math.round((passes.length / totalEvaluated) * 100) : 100;

  const earned = passes.length * 10;
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

function resultItems(items: Result[]): ScanResultItem[] {
  return items.map(({ id, impact, description, help, helpUrl, tags, nodes }) => ({
    id,
    impact,
    description,
    help,
    helpUrl,
    tags,
    nodes: nodes.map(({ any, all, none, failureSummary, html, target, impact: nodeImpact }) => ({
      any,
      all,
      none,
      failureSummary,
      html,
      target,
      impact: nodeImpact,
    })),
  }));
}

function toResponse(results: AxeResults, scannedUrl: string, source: ScanResponse['source']): ScanResponse {
  const violations = resultItems(results.violations);
  const passes = resultItems(results.passes);
  const incomplete = resultItems(results.incomplete);
  const score = calculateScore(violations, passes);
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
    let target: URL;
    try {
      target = new URL(rawUrl);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        await route.abort('blockedbyclient');
        return;
      }
      const validated = validateUrlSyntax(rawUrl);
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        mainNavigations += 1;
        if (mainNavigations > maxRedirects + 1) {
          blockedNavigation = new ScanError('The page redirected too many times. Check the URL and try again.', 400);
          await route.abort('blockedbyclient');
          return;
        }
      }
      await validatePublicDestination(validated);
      await route.continue();
    } catch (error) {
      await route.abort('blockedbyclient').catch(() => undefined);
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        blockedNavigation = error instanceof ScanError ? error : new ScanError('The website tried to navigate to a blocked address.', 400);
      }
    }
  });

  // WebSockets bypass ordinary HTTP route interception; disable them in the
  // untrusted page before its scripts execute.
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
  await page.evaluate(source);
  return page.evaluate(async () => {
    const axeApi = (window as Window & { axe?: { run: () => Promise<AxeResults> } }).axe;
    if (!axeApi) throw new Error('axe-core was not available in the page.');
    return axeApi.run();
  });
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
      timeout: 10_000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      serviceWorkers: 'block',
      ignoreHTTPSErrors: true,
      bypassCSP: true,
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(navigationTimeoutMs);
    page.setDefaultTimeout(10_000);

    // Bypass Trusted Types restrictions on strict CSP websites (e.g. YouTube)
    await page.addInitScript(() => {
      const win = window as unknown as { trustedTypes?: { createPolicy: (name: string, rules: Record<string, (s: string) => string>) => void } };
      if (win.trustedTypes && win.trustedTypes.createPolicy) {
        try {
          win.trustedTypes.createPolicy('default', {
            createHTML: (s: string) => s,
            createScript: (s: string) => s,
            createScriptURL: (s: string) => s,
          });
        } catch {
          // ignore if policy exists
        }
      }
    });

    const getBlockedNavigation = await protectBrowser(page);
    try {
      await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
    } catch (error) {
      const blockedNavigation = getBlockedNavigation();
      if (blockedNavigation) throw blockedNavigation;
      if (error instanceof ScanError) throw error;
      const message = error instanceof Error ? error.message : '';
      if (/timeout/i.test(message)) throw new ScanError('The page took too long to load. Try a faster public page.', 504);
      throw new ScanError('The page could not be loaded. Check that it is public and try again.', 502);
    }
    const results = await runAxe(page);
    return toResponse(results, page.url(), 'website');
  } catch (error) {
    if (timedOut) throw new ScanError('The scan exceeded its time limit. Try a simpler or faster page.', 504);
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
    if (timedOut) throw new ScanError('The demo scan exceeded its time limit. Please try again.', 504);
    throw error;
  } finally {
    clearTimeout(watchdog);
    if (browser) await browser.close().catch(() => undefined);
  }
}

app.get('/api/health', (_request, response) => response.json({ ok: true }));

app.post('/api/scan', async (request, response) => {
  try {
    const url = validateUrlSyntax(request.body?.url);
    response.json(await scanWebsite(url));
  } catch (error) {
    console.error('Scan error:', error);
    const known = error instanceof ScanError;
    const status = known ? error.status : 500;
    const message = known
      ? error.message
      : (error instanceof Error ? error.message : 'The scan could not be completed. Please try again.');
    response.status(status).json({ error: message });
  }
});

app.post('/api/demo', async (_request, response) => {
  try {
    response.json(await scanDemo());
  } catch (error) {
    const known = error instanceof ScanError;
    response.status(known ? error.status : 500).json({
      error: known ? error.message : 'The local demo scan could not be completed. Please try again.',
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
    response.status(400).json({ error: 'The request body must be valid JSON.' });
    return;
  }
  response.status(500).json({ error: 'The server could not complete that request.' });
});

const host = process.env.HOST ?? '0.0.0.0';
const server = app.listen(port, host, () => {
  console.log(`AccessScan listening on http://${host}:${port}`);
});
server.requestTimeout = requestTimeoutMs;
server.headersTimeout = requestTimeoutMs + 1000;
