import type { AuditScore } from '../types.js';

interface ScoreBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  score?: AuditScore;
}

export function ScoreBreakdownModal({ isOpen, onClose, score }: ScoreBreakdownModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="score-breakdown-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-badge">Auditing Methodology</div>
            <h2 id="score-breakdown-title" className="modal-title">How Accessibility Is Scored</h2>
            <p className="modal-desc">
              Understand the mathematical weighting formula, severity tiers, and why automated testing is an engineering estimate rather than a legal certification.
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close score modal">
            ✕
          </button>
        </div>

        {score && (
          <div className="score-summary-bar">
            <div className="score-pill-grade">Grade: {score.grade}</div>
            <div className="score-pill-rating">Rating: {score.rating}</div>
            <div className="score-pill-num">{score.score}/100</div>
            <div className="score-pill-compliance">{score.complianceRate}% Rule Compliance</div>
          </div>
        )}

        <div className="methodology-section">
          <h3 className="section-heading">Weighting Formula by Severity</h3>
          <p className="section-text">
            Every passed accessibility test awards <strong>+10 points</strong>. Violations apply weighted deductions reflecting the severity of barriers imposed on people with disabilities:
          </p>

          <div className="severity-grid">
            <div className="severity-card critical">
              <div className="severity-tag">Critical (-10 pts)</div>
              <div className="severity-count">{score?.impacts.critical ?? 0} Detected</div>
              <p className="severity-desc">
                Completely prevents blind, low-vision, or motor-impaired users from using the element (e.g. unlabeled buttons, missing form labels, keyboard traps).
              </p>
            </div>

            <div className="severity-card serious">
              <div className="severity-tag">Serious (-7 pts)</div>
              <div className="severity-count">{score?.impacts.serious ?? 0} Detected</div>
              <p className="severity-desc">
                Causes severe frustration and difficulty (e.g. low-contrast text, missing document title, missing skip link).
              </p>
            </div>

            <div className="severity-card moderate">
              <div className="severity-tag">Moderate (-4 pts)</div>
              <div className="severity-count">{score?.impacts.moderate ?? 0} Detected</div>
              <p className="severity-desc">
                Non-standard semantics or minor usability hurdles that require extra effort to interpret.
              </p>
            </div>

            <div className="severity-card minor">
              <div className="severity-tag">Minor (-2 pts)</div>
              <div className="severity-count">{score?.impacts.minor ?? 0} Detected</div>
              <p className="severity-desc">
                Subtle improvements that enhance user experience and clean markup conformance.
              </p>
            </div>
          </div>
        </div>

        <div className="disclaimer-callout">
          <div className="disclaimer-icon">⚠️</div>
          <div>
            <strong>Important Legal & Engineering Disclaimer:</strong>
            <p>
              Automated testing via axe-core evaluates between 30% and 40% of WCAG 2.1/2.2 AA success criteria. It cannot automatically evaluate subjective context, such as whether an image’s alternative text is meaningful, whether screen-reader reading order is logical, or whether custom dialogs provide sufficient contextual cues.
            </p>
            <p style={{ marginTop: '0.4rem' }}>
              <strong>This score is an automated engineering estimate</strong> to guide development sprints and remediations. Achieving 100/100 does not constitute a certified legal warranty of WCAG compliance without a complementary manual audit.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <a
            href="https://www.w3.org/WAI/WCAG21/quickref/"
            target="_blank"
            rel="noopener noreferrer"
            className="action-btn secondary"
          >
            Official W3C WCAG Guidelines ↗
          </a>
          <button type="button" className="action-btn primary" onClick={onClose}>
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  );
}
