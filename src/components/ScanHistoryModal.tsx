import { useState } from 'react';
import type { ScanHistoryEntry, RegressionComparison } from '../types.js';
import { getScanHistory, clearScanHistory, compareScans } from '../utils/scanHistory.js';

interface ScanHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentScan?: ScanHistoryEntry;
  onSelectScanUrl?: (url: string) => void;
}

export function ScanHistoryModal({ isOpen, onClose, currentScan, onSelectScanUrl }: ScanHistoryModalProps) {
  const [history, setHistory] = useState<ScanHistoryEntry[]>(() => getScanHistory());
  const [selectedForComparison, setSelectedForComparison] = useState<ScanHistoryEntry | null>(null);

  if (!isOpen) return null;

  const handleClear = () => {
    if (confirm('Clear all local scan history?')) {
      clearScanHistory();
      setHistory([]);
      setSelectedForComparison(null);
    }
  };

  // Find previous scan for same URL if available
  const autoPreviousScan = currentScan
    ? history.find((h) => h.url === currentScan.url && h.id !== currentScan.id)
    : undefined;

  const compareTarget = selectedForComparison || autoPreviousScan;
  let diff: RegressionComparison | null = null;
  if (currentScan && compareTarget) {
    diff = compareScans(currentScan, compareTarget);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
      <div className="modal-card history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-badge">Regression Tracking</div>
            <h2 id="history-modal-title" className="modal-title">Scan History & Comparisons</h2>
            <p className="modal-desc">
              Track accessibility improvements over time, identify resolved issues, and catch newly introduced regressions.
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close history modal">
            ✕
          </button>
        </div>

        {/* If comparing current scan with previous scan */}
        {diff && (
          <div className="regression-diff-box">
            <div className="diff-header">
              <span className="diff-title">
                Before & After Comparison: {diff.previousScan.url}
              </span>
              <span className={`diff-delta ${diff.scoreDelta >= 0 ? 'delta-positive' : 'delta-negative'}`}>
                {diff.scoreDelta >= 0 ? `+${diff.scoreDelta}` : diff.scoreDelta} Score Change
              </span>
            </div>

            <div className="diff-metrics-grid">
              <div className="diff-metric-card">
                <span className="metric-label">Previous Score</span>
                <span className="metric-val">{diff.previousScan.score}/100</span>
                <span className="metric-sub">{new Date(diff.previousScan.scannedAt).toLocaleDateString()}</span>
              </div>
              <div className="diff-metric-card">
                <span className="metric-label">Current Score</span>
                <span className="metric-val current">{diff.currentScore}/100</span>
                <span className="metric-sub">Latest Scan</span>
              </div>
              <div className="diff-metric-card resolved">
                <span className="metric-label">Resolved Issues</span>
                <span className="metric-val resolved">{diff.resolvedViolations.length}</span>
                <span className="metric-sub">Fixed since last scan</span>
              </div>
              <div className="diff-metric-card regressions">
                <span className="metric-label">New Regressions</span>
                <span className="metric-val regressions">{diff.newRegressions.length}</span>
                <span className="metric-sub">Newly introduced</span>
              </div>
            </div>

            {/* Resolved issues list */}
            {diff.resolvedViolations.length > 0 && (
              <div className="diff-rule-group resolved-group">
                <div className="diff-group-title">🎉 Resolved Accessibility Issues (Fixed):</div>
                <div className="diff-tag-list">
                  {diff.resolvedViolations.map((id) => (
                    <span key={id} className="diff-tag resolved-tag">
                      ✓ {id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Regressions list */}
            {diff.newRegressions.length > 0 && (
              <div className="diff-rule-group regression-group">
                <div className="diff-group-title">⚠️ New Regressions (Attention Required):</div>
                <div className="diff-tag-list">
                  {diff.newRegressions.map((id) => (
                    <span key={id} className="diff-tag regression-tag">
                      ! {id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* History list */}
        <div className="history-list-section">
          <div className="history-list-header">
            <h3>Recent Audits ({history.length})</h3>
            {history.length > 0 && (
              <button type="button" className="text-action-btn" onClick={handleClear}>
                Clear All History
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="history-empty">
              <p>No past scans stored yet. Audits you run will appear here automatically for before-and-after regression tracking.</p>
            </div>
          ) : (
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Website URL</th>
                    <th>Date & Time</th>
                    <th>Viewport</th>
                    <th>Score</th>
                    <th>Violations</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className={currentScan?.id === item.id ? 'active-row' : ''}>
                      <td className="url-cell" title={item.url}>
                        {item.url}
                        {item.source === 'crawl' && <span className="history-source-badge">Crawl</span>}
                      </td>
                      <td className="date-cell">
                        {new Date(item.scannedAt).toLocaleDateString()} {new Date(item.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="viewport-cell">
                        {item.viewport === 'mobile' ? '📱 Mobile' : '💻 Desktop'}
                      </td>
                      <td>
                        <span className={`grade-tag grade-${item.grade.toLowerCase().replace('+', '-plus')}`}>
                          {item.score}/100 ({item.grade})
                        </span>
                      </td>
                      <td className="violations-cell">
                        <span className={item.violationsCount > 0 ? 'text-red' : 'text-green'}>
                          {item.violationsCount} issues
                        </span>
                      </td>
                      <td className="actions-cell">
                        {currentScan && currentScan.id !== item.id && (
                          <button
                            type="button"
                            className="mini-action-btn"
                            onClick={() => setSelectedForComparison(item)}
                          >
                            Compare
                          </button>
                        )}
                        <button
                          type="button"
                          className="mini-action-btn primary"
                          onClick={() => {
                            onSelectScanUrl?.(item.url);
                            onClose();
                          }}
                        >
                          Re-Scan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="action-btn secondary" onClick={onClose}>
            Close History
          </button>
        </div>
      </div>
    </div>
  );
}
