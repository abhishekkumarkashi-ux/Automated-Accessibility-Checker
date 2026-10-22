export type Category = 'violations' | 'incomplete' | 'passes';
export type Filter = 'all' | Category;

export interface AffectedNode {
  html: string;
  target: string[];
  impact: string | null;
  failureSummary?: string;
}

export interface Finding {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AffectedNode[];
}

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

export interface ScanReport {
  scanId?: string;
  scannedUrl: string;
  scannedAt: string;
  counts: Record<Category, number>;
  violations: Finding[];
  passes: Finding[];
  incomplete: Finding[];
  source: 'website' | 'demo';
  score?: AuditScore;
}

export interface ScanErrorInfo {
  error: string;
  code?: string;
  suggestion?: string;
  status?: number;
}

export interface ErrorState {
  title: string;
  message: string;
  suggestion?: string;
  code?: string;
  failedUrl?: string;
}

export interface AgentStatus {
  configured: boolean;
  model?: string;
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

