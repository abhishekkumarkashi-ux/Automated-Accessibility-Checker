import type { ScanHistoryEntry, RegressionComparison } from '../types.js';

const STORAGE_KEY = 'accessscan_scan_history_v1';
const MAX_HISTORY_ITEMS = 25;

export function getScanHistory(): ScanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveScanToHistory(entry: Omit<ScanHistoryEntry, 'id'>): ScanHistoryEntry {
  const history = getScanHistory();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item: ScanHistoryEntry = { ...entry, id };

  // Prepend newest scan
  const updated = [item, ...history.filter((h) => h.id !== id)].slice(0, MAX_HISTORY_ITEMS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota error
  }

  return item;
}

export function findPreviousScanForUrl(url: string, excludeId?: string): ScanHistoryEntry | undefined {
  const history = getScanHistory();
  return history.find((h) => h.url === url && (!excludeId || h.id !== excludeId));
}

export function compareScans(current: ScanHistoryEntry, previous: ScanHistoryEntry): RegressionComparison {
  const prevSet = new Set(previous.violationIds);
  const currSet = new Set(current.violationIds);

  const resolvedViolations = previous.violationIds.filter((id) => !currSet.has(id));
  const newRegressions = current.violationIds.filter((id) => !prevSet.has(id));
  const persistentViolations = current.violationIds.filter((id) => prevSet.has(id));

  const scoreDelta = current.score - previous.score;

  return {
    previousScan: previous,
    currentScore: current.score,
    scoreDelta,
    resolvedViolations,
    newRegressions,
    persistentViolations,
  };
}

export function clearScanHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
