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

export interface PageScanResult {
  url: string;
  pageTitle: string;
  scannedAt: string;
  counts: Record<Category, number>;
  score: AuditScore;
  violations: Finding[];
  passes: Finding[];
  incomplete: Finding[];
}

export interface CrawlReport {
  scanId?: string;
  startingUrl: string;
  scannedAt: string;
  source: 'crawl';
  viewport: 'desktop' | 'mobile';
  totalPagesScanned: number;
  overallScore: AuditScore & { totalViolations: number; totalPasses: number };
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

export interface ManualAuditItem {
  id: string;
  title: string;
  wcagCriterion: string;
  description: string;
  testSteps: string[];
  status: 'untested' | 'pass' | 'fail' | 'na';
  notes: string;
}

export interface ScanHistoryEntry {
  id: string;
  url: string;
  scannedAt: string;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  violationsCount: number;
  passesCount: number;
  violationIds: string[];
  viewport: 'desktop' | 'mobile';
  source: 'website' | 'crawl' | 'demo';
}

export interface RegressionComparison {
  previousScan: ScanHistoryEntry;
  currentScore: number;
  scoreDelta: number;
  resolvedViolations: string[];
  newRegressions: string[];
  persistentViolations: string[];
}


