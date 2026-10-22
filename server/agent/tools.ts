import { scanStore } from './scanStore.js';
import { getAxeRuleGuidance, type RuleGuidance } from './ruleGuidance.js';

export interface ScanFindingsSummary {
  scanId: string;
  source: 'website' | 'demo';
  score: {
    score: number;
    grade: string;
    rating: string;
    complianceRate: number;
    affectedElements: number;
    impacts: Record<string, number>;
  };
  counts: {
    violations: number;
    passes: number;
    incomplete: number;
  };
  violations: Array<{
    ruleId: string;
    impact: string;
    help: string;
    description: string;
    helpUrl: string;
    tags: string[];
    affectedElementsCount: number;
    sampleSelectors: string[];
    sampleHtmlSnippets: string[];
  }>;
  incompleteChecks: Array<{
    ruleId: string;
    help: string;
    affectedElementsCount: number;
  }>;
}

export interface PrioritizedFindingItem {
  priorityRank: number;
  ruleId: string;
  impact: string;
  help: string;
  affectedElementsCount: number;
  weight: number;
  rationale: string;
}

const impactWeights: Record<string, number> = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
};

/**
 * Tool 1: get_scan_findings(scanId)
 * Returns a validated, temporary scan summary and its findings.
 */
export function getScanFindings(scanId: string): ScanFindingsSummary {
  if (!scanId || typeof scanId !== 'string') {
    throw new Error('A valid string scanId must be provided.');
  }

  const scan = scanStore.get(scanId);
  if (!scan) {
    throw new Error(`Scan with ID "${scanId}" was not found or has expired.`);
  }

  return {
    scanId,
    source: scan.source,
    score: {
      score: scan.score.score,
      grade: scan.score.grade,
      rating: scan.score.rating,
      complianceRate: scan.score.complianceRate,
      affectedElements: scan.score.affectedElements,
      impacts: scan.score.impacts,
    },
    counts: scan.counts,
    violations: scan.violations.map((v) => ({
      ruleId: v.id,
      impact: v.impact ?? 'minor',
      help: v.help,
      description: v.description,
      helpUrl: v.helpUrl,
      tags: v.tags,
      affectedElementsCount: v.nodes.length,
      sampleSelectors: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      sampleHtmlSnippets: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 300)),
    })),
    incompleteChecks: scan.incomplete.map((i) => ({
      ruleId: i.id,
      help: i.help,
      affectedElementsCount: i.nodes.length,
    })),
  };
}

/**
 * Tool 2: get_axe_rule_guidance(ruleId)
 * Returns the rule's description, relevant tags, help URL, and curated guidance.
 */
export function getAxeRuleGuidanceTool(ruleId: string): RuleGuidance {
  if (!ruleId || typeof ruleId !== 'string') {
    throw new Error('A valid string ruleId must be provided.');
  }
  return getAxeRuleGuidance(ruleId);
}

/**
 * Tool 3: prioritize_findings(scanId, limit)
 * Ranks findings deterministically by severity impact and number of affected elements.
 */
export function prioritizeFindings(scanId: string, limit = 5): { scanId: string; count: number; prioritized: PrioritizedFindingItem[] } {
  if (!scanId || typeof scanId !== 'string') {
    throw new Error('A valid string scanId must be provided.');
  }

  const scan = scanStore.get(scanId);
  if (!scan) {
    throw new Error(`Scan with ID "${scanId}" was not found or has expired.`);
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 10));

  // Sort violations deterministically: impact weight desc, then affected elements count desc
  const sorted = [...scan.violations].sort((a, b) => {
    const weightA = impactWeights[a.impact?.toLowerCase() ?? 'minor'] ?? 1;
    const weightB = impactWeights[b.impact?.toLowerCase() ?? 'minor'] ?? 1;
    if (weightB !== weightA) {
      return weightB - weightA;
    }
    return b.nodes.length - a.nodes.length;
  });

  const prioritized: PrioritizedFindingItem[] = sorted.slice(0, safeLimit).map((v, index) => {
    const impact = (v.impact?.toLowerCase() ?? 'minor');
    const weight = impactWeights[impact] ?? 1;
    const count = v.nodes.length;

    let rationale = '';
    if (impact === 'critical') {
      rationale = `Critical blocker (${count} affected ${count === 1 ? 'element' : 'elements'}). Completely blocks access for users with screen readers or keyboards.`;
    } else if (impact === 'serious') {
      rationale = `Serious barrier (${count} affected ${count === 1 ? 'element' : 'elements'}). Significantly degrades navigation and comprehension.`;
    } else if (impact === 'moderate') {
      rationale = `Moderate issue (${count} affected ${count === 1 ? 'element' : 'elements'}). Causes friction or inconsistent assistive behavior.`;
    } else {
      rationale = `Minor issue (${count} affected ${count === 1 ? 'element' : 'elements'}). Recommended for polish and WCAG compliance.`;
    }

    return {
      priorityRank: index + 1,
      ruleId: v.id,
      impact,
      help: v.help,
      affectedElementsCount: count,
      weight,
      rationale,
    };
  });

  return {
    scanId,
    count: prioritized.length,
    prioritized,
  };
}

export const functionToolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'get_scan_findings',
      description: 'Returns a validated, temporary scan summary and list of accessibility findings for the given scanId.',
      parameters: {
        type: 'object',
        properties: {
          scanId: {
            type: 'string',
            description: 'The unique temporary identifier of the scan.',
          },
        },
        required: ['scanId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_axe_rule_guidance',
      description: "Returns the rule's description, relevant WCAG tags, help URL, plain-language explanation, and curated fix guidance for an axe-core rule.",
      parameters: {
        type: 'object',
        properties: {
          ruleId: {
            type: 'string',
            description: 'The axe-core rule identifier (e.g. "image-alt", "color-contrast", "button-name", "label").',
          },
        },
        required: ['ruleId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'prioritize_findings',
      description: 'Ranks findings deterministically by impact severity (critical > serious > moderate > minor) and number of affected elements.',
      parameters: {
        type: 'object',
        properties: {
          scanId: {
            type: 'string',
            description: 'The unique temporary identifier of the scan.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of top prioritized findings to return (1-10, default 5).',
          },
        },
        required: ['scanId'],
        additionalProperties: false,
      },
    },
  },
];
