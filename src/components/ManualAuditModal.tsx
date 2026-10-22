import { useState, useEffect } from 'react';
import type { ManualAuditItem } from '../types.js';

interface ManualAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedUrl?: string;
  onSave?: (items: ManualAuditItem[]) => void;
}

const DEFAULT_CHECKPOINTS: Omit<ManualAuditItem, 'status' | 'notes'>[] = [
  {
    id: 'keyboard-navigation',
    title: 'Keyboard Operability & No Traps',
    wcagCriterion: 'WCAG 2.1 SC 2.1.1 & 2.1.2 (Level A)',
    description: 'All interactive elements (buttons, links, form inputs, dialogs) can be reached and activated using only Tab, Shift+Tab, Enter, and Space keys.',
    testSteps: [
      'Unplug or stop using your mouse. Start at top of the page.',
      'Press Tab repeatedly through the entire page. Can you reach every control?',
      'Open any modal, popup, or dropdown menu: does focus stay inside the modal, and does Escape close it?',
      'Ensure focus never gets permanently trapped in any widget.',
    ],
  },
  {
    id: 'focus-visible',
    title: 'Visible Keyboard Focus Indicator',
    wcagCriterion: 'WCAG 2.1 SC 2.4.7 (Level AA)',
    description: 'A prominent, high-contrast visual outline or ring clearly shows which interactive element currently has keyboard focus.',
    testSteps: [
      'Tab through the page and watch the active element outline.',
      'Verify the outline is never hidden with CSS "outline: none" without an alternative.',
      'Ensure the focus ring contrast is easily distinguishable against adjacent background colors.',
    ],
  },
  {
    id: 'alt-text-context',
    title: 'Contextual Image Alt Description Quality',
    wcagCriterion: 'WCAG 2.1 SC 1.1.1 (Level A)',
    description: 'Alternative text is descriptive and meaningful in its specific context, not raw filenames ("IMG_123.jpg") or redundant phrases ("image of...").',
    testSteps: [
      'Inspect key images, charts, and logos on the page.',
      'Confirm informative images describe the actual information or data depicted.',
      'Confirm decorative icons or repetitive images have empty alt="" so screen readers ignore them.',
    ],
  },
  {
    id: 'focus-order',
    title: 'Logical Tab Order & Reading Sequence',
    wcagCriterion: 'WCAG 2.1 SC 2.4.3 & 1.3.2 (Level A)',
    description: 'The order in which elements receive keyboard focus matches the visual layout and natural reading order (left-to-right, top-to-bottom).',
    testSteps: [
      'Tab through columns, cards, and multi-column forms.',
      'Confirm focus does not jump unexpectedly across disjointed page areas.',
      'Avoid positive tabindex (tabindex="1", "2") which breaks natural DOM sequence.',
    ],
  },
  {
    id: 'reflow-zoom',
    title: '200% Zoom & Responsive Reflow',
    wcagCriterion: 'WCAG 2.1 SC 1.4.4 & 1.4.10 (Level AA)',
    description: 'Content can be enlarged up to 200% without loss of content or functionality, and without requiring two-dimensional (horizontal) scrolling.',
    testSteps: [
      'Press Ctrl + (Cmd +) to zoom browser page to 200% and 400%.',
      'Check if text overflows boxes, overlaps other text, or gets clipped.',
      'Verify that all buttons and forms remain completely usable.',
    ],
  },
  {
    id: 'screen-reader-aria',
    title: 'Dynamic Announcements & State Changes',
    wcagCriterion: 'WCAG 2.1 SC 4.1.2 & 4.1.3 (Level A & AA)',
    description: 'Dynamic updates (such as form validation error alerts, tabs, accordions, loading states) are announced by screen readers via live regions.',
    testSteps: [
      'Trigger an accordion or dropdown: is aria-expanded toggled between "true" and "false"?',
      'Submit a form with an error: does the error message get read immediately via aria-live or role="alert"?',
      'Test with NVDA (Windows), VoiceOver (Mac/iOS), or TalkBack (Android).',
    ],
  },
];

const STORAGE_KEY = 'accessscan_manual_audit_v1';

export function ManualAuditModal({ isOpen, onClose, scannedUrl, onSave }: ManualAuditModalProps) {
  const [items, setItems] = useState<ManualAuditItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === DEFAULT_CHECKPOINTS.length) {
          return parsed;
        }
      }
    } catch {
      // Ignore
    }
    return DEFAULT_CHECKPOINTS.map((cp) => ({
      ...cp,
      status: 'untested',
      notes: '',
    }));
  });

  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore
    }
  }, [items]);

  if (!isOpen) return null;

  const passedCount = items.filter((i) => i.status === 'pass').length;
  const failedCount = items.filter((i) => i.status === 'fail').length;
  const untestedCount = items.filter((i) => i.status === 'untested').length;

  const updateStatus = (id: string, status: ManualAuditItem['status']) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  };

  const updateNotes = (id: string, notes: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, notes } : item)));
  };

  const handleSave = () => {
    onSave?.(items);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleReset = () => {
    if (confirm('Reset all manual audit answers to Untested?')) {
      const reset = DEFAULT_CHECKPOINTS.map((cp) => ({
        ...cp,
        status: 'untested' as const,
        notes: '',
      }));
      setItems(reset);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="manual-audit-title">
      <div className="modal-card manual-audit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-badge">WCAG 2.1 AA Checklist</div>
            <h2 id="manual-audit-title" className="modal-title">Guided Manual Accessibility Audit</h2>
            <p className="modal-desc">
              Automated scanners only detect 30–40% of WCAG criteria. This interactive checklist covers the essential manual tests for {scannedUrl || 'your website'}.
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close manual audit modal">
            ✕
          </button>
        </div>

        {/* Progress summary bar */}
        <div className="manual-audit-stats">
          <div className="stat-pill pass-pill">✓ {passedCount} Passed</div>
          <div className="stat-pill fail-pill">✗ {failedCount} Failed</div>
          <div className="stat-pill untested-pill">⚪ {untestedCount} Untested</div>
          <div className="stat-progress-container">
            <div
              className="stat-progress-bar"
              style={{
                width: `${items.length > 0 ? ((passedCount + failedCount) / items.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="manual-audit-list">
          {items.map((item, index) => (
            <div key={item.id} className={`audit-card status-${item.status}`}>
              <div className="audit-card-header">
                <div>
                  <span className="audit-step-num">Check #{index + 1}</span>
                  <span className="audit-criterion-tag">{item.wcagCriterion}</span>
                  <h3 className="audit-item-title">{item.title}</h3>
                </div>

                <div className="audit-btn-group" role="group" aria-label={`Status for ${item.title}`}>
                  <button
                    type="button"
                    className={`status-btn btn-pass ${item.status === 'pass' ? 'active' : ''}`}
                    onClick={() => updateStatus(item.id, 'pass')}
                  >
                    ✓ Pass
                  </button>
                  <button
                    type="button"
                    className={`status-btn btn-fail ${item.status === 'fail' ? 'active' : ''}`}
                    onClick={() => updateStatus(item.id, 'fail')}
                  >
                    ✗ Fail
                  </button>
                  <button
                    type="button"
                    className={`status-btn btn-na ${item.status === 'na' ? 'active' : ''}`}
                    onClick={() => updateStatus(item.id, 'na')}
                  >
                    N/A
                  </button>
                  <button
                    type="button"
                    className={`status-btn btn-untested ${item.status === 'untested' ? 'active' : ''}`}
                    onClick={() => updateStatus(item.id, 'untested')}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <p className="audit-item-desc">{item.description}</p>

              <div className="audit-test-steps">
                <strong>How to test:</strong>
                <ul>
                  {item.testSteps.map((step, sIdx) => (
                    <li key={sIdx}>{step}</li>
                  ))}
                </ul>
              </div>

              <div className="audit-notes-box">
                <label htmlFor={`notes-${item.id}`} className="audit-notes-label">
                  Auditor Notes & Observations:
                </label>
                <input
                  id={`notes-${item.id}`}
                  type="text"
                  className="audit-notes-input"
                  placeholder="e.g. Navigation modal traps focus on mobile; logo missing alt text..."
                  value={item.notes}
                  onChange={(e) => updateNotes(item.id, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button type="button" className="action-btn secondary" onClick={handleReset}>
            Reset All
          </button>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {savedNotice && <span className="save-toast">✓ Saved to browser</span>}
            <button type="button" className="action-btn primary" onClick={handleSave}>
              Save Checklist
            </button>
            <button type="button" className="action-btn secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
