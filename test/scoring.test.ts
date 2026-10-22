import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCrawlScore, aggregateUniqueViolations } from '../server/crawler.js';

test('Scoring: Perfect score when 0 violations exist', () => {
  const emptyPages = [
    {
      url: 'https://example.com',
      pageTitle: 'Example',
      scannedAt: new Date().toISOString(),
      counts: { violations: 0, passes: 25, incomplete: 0 },
      score: {
        score: 100,
        grade: 'A+' as const,
        rating: 'Excellent',
        complianceRate: 100,
        totalEvaluated: 25,
        affectedElements: 0,
        impacts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      },
      violations: [],
      passes: [],
      incomplete: [],
    },
  ];

  const overall = aggregateCrawlScore(emptyPages);
  assert.strictEqual(overall.score, 100);
  assert.strictEqual(overall.grade, 'A+');
  assert.strictEqual(overall.totalViolations, 0);
});

test('Scoring: Critical violations heavily penalize score', () => {
  const flawedPages = [
    {
      url: 'https://example.com/login',
      pageTitle: 'Login',
      scannedAt: new Date().toISOString(),
      counts: { violations: 5, passes: 5, incomplete: 0 },
      score: {
        score: 50,
        grade: 'D' as const,
        rating: 'Substandard',
        complianceRate: 50,
        totalEvaluated: 10,
        affectedElements: 12,
        impacts: { critical: 3, serious: 2, moderate: 0, minor: 0 },
      },
      violations: [
        {
          id: 'image-alt',
          impact: 'critical',
          description: 'Images must have alt text',
          help: 'Add alt attribute',
          helpUrl: 'https://dequeuniversity.com',
          nodes: [{ any: [], all: [], none: [], html: '<img>', target: ['img'] }],
        },
      ],
      passes: [],
      incomplete: [],
    },
  ];

  const overall = aggregateCrawlScore(flawedPages);
  assert.ok(overall.score < 60, `Score should be below 60 with multiple critical violations, got ${overall.score}`);
  assert.strictEqual(overall.totalViolations, 5);
  assert.strictEqual(overall.impacts.critical, 3);
});

test('Unique Violations Aggregation: De-duplicates same violation across multiple pages', () => {
  const pages = [
    {
      url: 'https://example.com/page1',
      pageTitle: 'Page 1',
      scannedAt: new Date().toISOString(),
      counts: { violations: 1, passes: 10, incomplete: 0 },
      score: {
        score: 90,
        grade: 'A' as const,
        rating: 'Good',
        complianceRate: 90,
        totalEvaluated: 11,
        affectedElements: 1,
        impacts: { critical: 1, serious: 0, moderate: 0, minor: 0 },
      },
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          description: 'Elements must have sufficient color contrast',
          help: 'Ensure contrast ratio meets WCAG 2 AA minimums',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
          nodes: [{ any: [], all: [], none: [], html: '<p>Low</p>', target: ['p'] }],
        },
      ],
      passes: [],
      incomplete: [],
    },
    {
      url: 'https://example.com/page2',
      pageTitle: 'Page 2',
      scannedAt: new Date().toISOString(),
      counts: { violations: 1, passes: 10, incomplete: 0 },
      score: {
        score: 90,
        grade: 'A' as const,
        rating: 'Good',
        complianceRate: 90,
        totalEvaluated: 11,
        affectedElements: 2,
        impacts: { critical: 1, serious: 0, moderate: 0, minor: 0 },
      },
      violations: [
        {
          id: 'color-contrast',
          impact: 'serious',
          description: 'Elements must have sufficient color contrast',
          help: 'Ensure contrast ratio meets WCAG 2 AA minimums',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
          nodes: [
            { any: [], all: [], none: [], html: '<a>Low 1</a>', target: ['a'] },
            { any: [], all: [], none: [], html: '<a>Low 2</a>', target: ['a'] },
          ],
        },
      ],
      passes: [],
      incomplete: [],
    },
  ];

  const unique = aggregateUniqueViolations(pages);
  assert.strictEqual(unique.length, 1, 'Same rule on both pages should be aggregated into 1 unique rule');
  assert.strictEqual(unique[0].id, 'color-contrast');
  assert.strictEqual(unique[0].affectedPagesCount, 2);
  assert.strictEqual(unique[0].totalOccurrences, 3);
});
