import type { Page } from 'playwright';
import type { Result } from 'axe-core';

export interface PageScanResult {
  url: string;
  pageTitle: string;
  scannedAt: string;
  counts: { violations: number; passes: number; incomplete: number };
  score: {
    score: number;
    grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    rating: string;
    complianceRate: number;
    totalEvaluated: number;
    affectedElements: number;
    impacts: { critical: number; serious: number; moderate: number; minor: number };
  };
  violations: Array<Pick<Result, 'id' | 'impact' | 'description' | 'help' | 'helpUrl' | 'tags' | 'nodes'>>;
  passes: Array<Pick<Result, 'id' | 'impact' | 'description' | 'help' | 'helpUrl' | 'tags' | 'nodes'>>;
  incomplete: Array<Pick<Result, 'id' | 'impact' | 'description' | 'help' | 'helpUrl' | 'tags' | 'nodes'>>;
}

export interface CrawlResponse {
  scanId?: string;
  startingUrl: string;
  scannedAt: string;
  source: 'website' | 'crawl';
  viewport: 'desktop' | 'mobile';
  totalPagesScanned: number;
  overallScore: {
    score: number;
    grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    rating: string;
    totalViolations: number;
    totalPasses: number;
    totalEvaluated: number;
    affectedElements: number;
    impacts: { critical: number; serious: number; moderate: number; minor: number };
  };
  pages: PageScanResult[];
  siteWideUniqueViolations: Array<{
    id: string;
    impact?: string;
    description: string;
    help: string;
    helpUrl: string;
    tags?: string[];
    affectedPagesCount: number;
    pages: string[];
    totalOccurrences: number;
  }>;
}

const STATIC_EXTENSIONS = /\.(pdf|zip|tar|gz|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|svg|mp4|webm|avi|mp3|wav|css|js|json|xml|rss|txt)$/i;

/**
 * Extracts internal same-origin links from the page
 */
export async function extractInternalLinks(page: Page, rootUrl: URL): Promise<string[]> {
  try {
    const rawLinks: string[] = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
      return anchors
        .map((a) => a.href)
        .filter((href) => Boolean(href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')));
    });

    const validUrls: string[] = [];
    const seen = new Set<string>();
    const rootHostname = rootUrl.hostname.toLowerCase();

    for (const raw of rawLinks) {
      try {
        const parsed = new URL(raw);
        // Only internal links matching exact same origin hostname or subdomain
        if (parsed.hostname.toLowerCase() !== rootHostname) continue;
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

        // Strip hash fragment and query tracking params
        parsed.hash = '';
        parsed.search = '';

        const clean = parsed.toString().replace(/\/+$/, '');
        if (STATIC_EXTENSIONS.test(parsed.pathname)) continue;
        if (/logout|signout|delete|exit/i.test(parsed.pathname)) continue;

        if (!seen.has(clean)) {
          seen.add(clean);
          validUrls.push(clean);
        }
      } catch {
        // Ignore malformed hrefs
      }
    }

    return validUrls;
  } catch {
    return [];
  }
}

/**
 * Calculates aggregated score across all crawled pages
 */
export function aggregateCrawlScore(pages: PageScanResult[]): CrawlResponse['overallScore'] {
  const impacts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let totalViolations = 0;
  let totalPasses = 0;
  let totalElements = 0;

  for (const p of pages) {
    totalViolations += p.counts.violations;
    totalPasses += p.counts.passes;
    totalElements += p.score.affectedElements;
    impacts.critical += p.score.impacts.critical;
    impacts.serious += p.score.impacts.serious;
    impacts.moderate += p.score.impacts.moderate;
    impacts.minor += p.score.impacts.minor;
  }

  const totalEvaluated = totalPasses + totalViolations;
  const earned = totalPasses * 10;
  const violationPoints = impacts.critical * 10 + impacts.serious * 7 + impacts.moderate * 4 + impacts.minor * 2;
  const totalPossible = earned + violationPoints;
  const score = totalPossible > 0 ? Math.round((earned / totalPossible) * 100) : 100;

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  let rating: string;

  if (score >= 98 && totalViolations === 0) {
    grade = 'A+';
    rating = 'Excellent (Multi-Page)';
  } else if (score >= 90) {
    grade = 'A';
    rating = 'Very Good (Multi-Page)';
  } else if (score >= 80) {
    grade = 'B';
    rating = 'Good (Multi-Page)';
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
    totalViolations,
    totalPasses,
    totalEvaluated,
    affectedElements: totalElements,
    impacts,
  };
}

/**
 * Aggregates unique violations across all pages to show site-wide accessibility problems
 */
export function aggregateUniqueViolations(pages: PageScanResult[]): CrawlResponse['siteWideUniqueViolations'] {
  const map = new Map<
    string,
    {
      id: string;
      impact?: string;
      description: string;
      help: string;
      helpUrl: string;
      tags?: string[];
      affectedPages: Set<string>;
      totalOccurrences: number;
    }
  >();

  for (const page of pages) {
    for (const v of page.violations) {
      const existing = map.get(v.id);
      const occurrences = v.nodes?.length || 1;
      if (!existing) {
        map.set(v.id, {
          id: v.id,
          impact: (v.impact ?? undefined) as string | undefined,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          affectedPages: new Set([page.url]),
          totalOccurrences: occurrences,
        });
      } else {
        existing.affectedPages.add(page.url);
        existing.totalOccurrences += occurrences;
      }
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      id: item.id,
      impact: item.impact,
      description: item.description,
      help: item.help,
      helpUrl: item.helpUrl,
      tags: item.tags,
      affectedPagesCount: item.affectedPages.size,
      pages: Array.from(item.affectedPages),
      totalOccurrences: item.totalOccurrences,
    }))
    .sort((a, b) => b.affectedPagesCount - a.affectedPagesCount || b.totalOccurrences - a.totalOccurrences);
}
