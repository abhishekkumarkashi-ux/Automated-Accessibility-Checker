import type { Finding, AuditScore } from '../types';

export function calculateScore(
  violations: Finding[],
  passes: Finding[]
): AuditScore {
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

  // Passes earn 10 points each
  // Violations have weighted penalty based on severity:
  // critical: 10, serious: 7, moderate: 4, minor: 2
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

export function getScoreColor(score: number): string {
  if (score >= 90) return '#10b981'; // Green
  if (score >= 80) return '#0ea5e9'; // Teal / Sky
  if (score >= 70) return '#f59e0b'; // Amber
  if (score >= 60) return '#f97316'; // Orange
  return '#ef4444'; // Red
}
