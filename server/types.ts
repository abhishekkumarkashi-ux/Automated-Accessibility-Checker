import type { Result } from 'axe-core';

export type ScanCategory = 'violations' | 'passes' | 'incomplete';
export type ScanResultItem = Pick<Result, 'id' | 'impact' | 'description' | 'help' | 'helpUrl' | 'tags' | 'nodes'>;

export interface AuditScore {
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

export interface ScanResponse {
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

export interface RemediationFinding {
  ruleId: string;
  help: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  whyFirst: string;
  steps: string[];
  codeExample: string | null;
  wcagTags: string[];
  helpUrl: string;
  affectedElementsCount: number;
}

export interface RemediationPlan {
  scanId: string;
  summary: string;
  priorityFindings: RemediationFinding[];
  manualReviewNotes: string;
  generatedAt: string;
  model: string;
}
