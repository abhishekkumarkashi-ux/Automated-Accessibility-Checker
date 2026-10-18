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
  scannedUrl: string;
  scannedAt: string;
  counts: Record<Category, number>;
  violations: Finding[];
  passes: Finding[];
  incomplete: Finding[];
  source: 'website' | 'demo';
  score?: AuditScore;
}
