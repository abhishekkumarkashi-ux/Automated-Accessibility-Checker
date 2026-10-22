import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AgentStatus,
  AuditScore,
  Category,
  ErrorState,
  Filter,
  Finding,
  RemediationPlan,
  ScanErrorInfo,
  ScanReport,
} from './types';
import { calculateScore, getScoreColor } from './utils/score';
import { generateAccessibilityPdfReport } from './utils/pdfReport';

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All results' },
  { id: 'violations', label: 'Violations' },
  { id: 'incomplete', label: 'Manual review' },
  { id: 'passes', label: 'Passed checks' },
];

const quickPresets = [
  { label: 'YouTube', domain: 'youtube.com' },
  { label: 'NASA', domain: 'nasa.gov' },
  { label: 'Wikipedia', domain: 'wikipedia.org' },
  { label: 'GitHub', domain: 'github.com' },
];

function normalizeUrlInput(raw: string): string {
  let trimmed = raw.trim().replace(/^["'`]|["'`]$/g, '').trim();
  if (!trimmed) return '';
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    if (trimmed.startsWith('//')) {
      trimmed = 'https:' + trimmed;
    } else {
      trimmed = 'https://' + trimmed;
    }
  }
  return trimmed;
}

const explanations: Record<string, string> = {
  'image-alt': 'People using a screen reader need a text alternative to understand what this image communicates. If it is only decoration, mark it as decorative instead.',
  label: 'Form fields need a clear name so people can tell what information to enter. A nearby placeholder disappears while typing and is not a reliable label.',
  'button-name': 'Give this button a short, clear name. Screen readers and voice controls use that name to tell people what the button does.',
  'link-name': 'Add visible link text or an accessible name so people know where this link will take them.',
  'color-contrast': 'Text needs enough contrast against its background to remain readable for people with low vision or in bright conditions.',
  'document-title': 'A useful page title helps people identify the page in browser tabs and when navigating with assistive technology.',
};

const fixes: Record<string, string> = {
  'image-alt': 'For an informative image, add a concise alt attribute that conveys its purpose. For a purely decorative image, use alt="".',
  label: 'Add a visible <label for="field-id"> that points to the control’s id, or provide an equivalent accessible name when a visible label is not appropriate.',
  'button-name': 'Put descriptive text inside the button, or add aria-label with a concise action name when the button is icon-only.',
  'link-name': 'Use descriptive text inside the link, or add an accessible name if the link contains only an icon.',
  'color-contrast': 'Adjust the foreground or background color, then check the actual text size and contrast ratio against your design requirements.',
  'document-title': 'Add a concise, page-specific <title> element inside the document head.',
};

const categoryMeta: Record<Category, { label: string; icon: string }> = {
  violations: { label: 'Violation', icon: '!' },
  incomplete: { label: 'Needs review', icon: '?' },
  passes: { label: 'Passed', icon: '✓' },
};

function formatDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}

function countForFilter(report: ScanReport, filter: Filter): number {
  return filter === 'all'
    ? report.violations.length + report.incomplete.length + report.passes.length
    : report[filter].length;
}

function App() {
  const [url, setUrl] = useState('');
  const [report, setReport] = useState<ScanReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [error, setError] = useState<ErrorState | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [aiPlan, setAiPlan] = useState<RemediationPlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showDisclosureModal, setShowDisclosureModal] = useState(false);
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check agent configuration status on mount
  useEffect(() => {
    fetch('/api/agent/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AgentStatus | null) => {
        if (data) setAgentStatus(data);
      })
      .catch(() => setAgentStatus({ configured: false }));
  }, []);

  // Timer for loading feedback on large pages
  useEffect(() => {
    if (!loading) {
      setLoadingElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [loading]);

  async function runScan(kind: 'website' | 'demo', urlOverride?: string, event?: FormEvent) {
    event?.preventDefault();
    if (loading) return;

    setError(null);
    setReport(null);
    setAiPlan(null);
    setAiError(null);
    setAiLoading(false);
    setFilter('all');
    setSearch('');
    setCopyMessage('');

    let targetUrl = '';
    if (kind === 'website') {
      const raw = urlOverride ?? url;
      targetUrl = normalizeUrlInput(raw);
      if (!targetUrl) {
        setError({
          title: 'Website address required',
          message: 'Please enter a website URL to scan, such as "youtube.com" or "https://example.com".',
          code: 'INVALID_URL',
        });
        return;
      }
      setUrl(targetUrl);
    }

    setLoading(true);

    try {
      const response = await fetch(kind === 'demo' ? '/api/demo' : '/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: kind === 'demo' ? '{}' : JSON.stringify({ url: targetUrl }),
      });

      const responseText = await response.text();
      let data: (ScanReport & ScanErrorInfo) | null = null;
      try {
        data = JSON.parse(responseText);
      } catch {
        // Non-JSON response (e.g. gateway timeout or proxy error)
        throw new Error(
          response.status === 504
            ? 'Gateway timeout: The website or proxy took too long to respond.'
            : `The server returned an unexpected response (HTTP ${response.status}).`
        );
      }

      if (!response.ok || !data || !('counts' in data)) {
        const errorMsg = data?.error || 'The scan could not be completed.';
        const code = data?.code || (response.status === 403 ? 'ACCESS_DENIED' : response.status === 404 ? 'NOT_FOUND' : 'SCAN_FAILED');
        const suggestion = data?.suggestion;

        let title = 'We couldn’t scan that page';
        if (code === 'TIMEOUT') title = 'Scan Timed Out';
        else if (code === 'ACCESS_DENIED') title = 'Access Restricted (HTTP 403)';
        else if (code === 'NOT_FOUND') title = 'Page Not Found (HTTP 404)';
        else if (code === 'DNS_FAILED') title = 'Website Host Not Found';
        else if (code === 'BLOCKED_ACCESS') title = 'Address Not Allowed';
        else if (code === 'REDIRECT_LOOP') title = 'Too Many Redirects';
        else if (code === 'INVALID_URL') title = 'Invalid Website Address';

        setError({
          title,
          message: errorMsg,
          code,
          suggestion,
          failedUrl: targetUrl,
        });
        return;
      }

      setReport(data);
    } catch (caught: unknown) {
      if (caught instanceof TypeError && caught.message.toLowerCase().includes('fetch')) {
        setError({
          title: 'Cannot reach scanning service',
          message: 'Failed to connect to the AccessScan backend server.',
          suggestion: 'Ensure the backend server is running on port 3001 and your internet connection is active.',
          code: 'NETWORK_ERROR',
          failedUrl: targetUrl,
        });
      } else {
        setError({
          title: 'Scan failed to complete',
          message: caught instanceof Error ? caught.message : 'An unexpected error occurred during the scan.',
          code: 'CLIENT_ERROR',
          suggestion: 'Please verify the address or try the demo scan.',
          failedUrl: targetUrl,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  const score = useMemo(() => {
    if (!report) return null;
    return report.score ?? calculateScore(report.violations, report.passes);
  }, [report]);

  const findings = useMemo(() => {
    if (!report) return [];
    const categories: Category[] = filter === 'all' ? ['violations', 'incomplete', 'passes'] : [filter];
    const query = search.trim().toLocaleLowerCase();
    return categories.flatMap((category) => report[category].map((finding) => ({ category, finding })))
      .filter(({ finding }) => {
        if (!query) return true;
        const haystack = [finding.id, finding.description, finding.help, ...finding.tags,
          ...finding.nodes.flatMap((node) => [...node.target, node.html])].join(' ').toLocaleLowerCase();
        return haystack.includes(query);
      });
  }, [filter, report, search]);

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('Clipboard is unavailable');
    }
    setCopyMessage(`${label} copied to clipboard.`);
    window.setTimeout(() => setCopyMessage(''), 2500);
  }

  function downloadPdfReport() {
    if (!report) return;
    setGeneratingPdf(true);
    try {
      generateAccessibilityPdfReport({
        report,
        score: score ?? report.score,
        aiPlan,
      });
      setCopyMessage('PDF audit report downloaded successfully.');
      window.setTimeout(() => setCopyMessage(''), 3000);
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
      alert('Could not generate the PDF report. Please try again.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  function downloadJson() {
    if (!report) return;
    const reportWithScore = {
      ...report,
      score: score ?? report.score,
    };
    const blob = new Blob([JSON.stringify(reportWithScore, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `accessscan-report-${new Date(report.scannedAt).toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  function resetScan() {
    setReport(null);
    setAiPlan(null);
    setAiError(null);
    setAiLoading(false);
    setUrl('');
    setFilter('all');
    setSearch('');
    setError(null);
    inputRef.current?.focus();
  }

  function handleGenerateAiPlanClick() {
    if (!report) return;
    if (!disclosureAcknowledged) {
      setShowDisclosureModal(true);
    } else {
      void requestAgentPlan();
    }
  }

  async function requestAgentPlan() {
    if (!report?.scanId) {
      setAiError('Scan identifier is unavailable. Please run a fresh scan to generate an AI plan.');
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId: report.scanId }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data?.error || 'Failed to generate accessibility remediation plan.';
        const suggestion = data?.suggestion ? `\n\nSuggestion: ${data.suggestion}` : '';
        setAiError(`${errorMsg}${suggestion}`);
        return;
      }

      setAiPlan(data as RemediationPlan);
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to the Accessibility Coach Agent service. Please check your connection.'
      );
    } finally {
      setAiLoading(false);
    }
  }

  const hasNoFindings = report !== null && report.counts.violations === 0 && report.counts.incomplete === 0;

  // Determine current scan phase for multi-stage loading feedback
  const loadingStage =
    loadingElapsed < 3
      ? { step: 1, title: 'Connecting to website', desc: 'Validating host and establishing secure browser session…' }
      : loadingElapsed < 9
      ? { step: 2, title: 'Loading page content', desc: 'Rendering page DOM, executing scripts, and loading styles…' }
      : loadingElapsed < 18
      ? { step: 3, title: 'Running accessibility checks', desc: 'Injecting axe-core engine to analyze WCAG rules and color contrast…' }
      : { step: 4, title: 'Evaluating large page', desc: 'Analyzing complex elements and shadow roots (this can take 15–30s on big sites)…' };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AccessScan home">
          <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.3 4.2L19.5 6.8" /></svg></span>
          <span>access<span className="brand-light">scan</span></span>
        </a>
        <div className="local-badge"><span aria-hidden="true" className="status-dot" /> LOCAL PROTOTYPE</div>
      </header>

      <main id="top" className="main-content">
        <section className="hero" aria-labelledby="page-title">
          <div className="eyebrow"><span className="eyebrow-line" /> ACCESSIBILITY, MADE ACTIONABLE</div>
          <h1 id="page-title">Make your page work<br className="desktop-break" /> for <span>everyone.</span></h1>
          <p className="hero-copy">Find accessibility issues on any webpage—from personal sites to major platforms—with clear explanations and fixes.</p>
        </section>

        <section className="scan-card" aria-labelledby="scan-title">
          <div className="scan-card-heading">
            <div className="scan-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.1 4.1M8 11h5.6M10.8 8.2v5.6" /></svg></div>
            <div>
              <h2 id="scan-title">Check a webpage</h2>
              <p>Type any domain (e.g. youtube.com, nasa.gov) or full URL.</p>
            </div>
          </div>
          <form className="scan-form" onSubmit={(event) => void runScan('website', undefined, event)}>
            <label htmlFor="website-url">Website URL or Domain</label>
            <div className="input-row">
              <div className="url-input-wrap">
                <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17M12 3c2.4 2.4 3.6 5.4 3.6 9s-1.2 6.6-3.6 9c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z" /></svg>
                <input
                  ref={inputRef}
                  id="website-url"
                  name="url"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="e.g. youtube.com, nasa.gov, or https://example.com"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onBlur={() => {
                    if (url.trim() && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url.trim())) {
                      setUrl(normalizeUrlInput(url));
                    }
                  }}
                  required
                  disabled={loading}
                />
              </div>
              <button className="primary-button" type="submit" disabled={loading || !url.trim()}>
                {loading ? <><span className="spinner" aria-hidden="true" /> Scanning…</> : <>Scan website <span aria-hidden="true">→</span></>}
              </button>
            </div>
          </form>

          {/* Quick-Try Suggestions */}
          <div className="quick-presets" aria-label="Quick test presets">
            <span className="presets-label">Quick try:</span>
            <div className="presets-chips">
              {quickPresets.map((preset) => (
                <button
                  key={preset.domain}
                  type="button"
                  className="preset-chip"
                  disabled={loading}
                  onClick={() => {
                    setUrl(`https://${preset.domain}`);
                    void runScan('website', `https://${preset.domain}`);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="scan-alternative">
            <span className="alternative-note">New to AccessScan?</span>
            <button className="demo-button" type="button" onClick={() => void runScan('demo')} disabled={loading}>
              Try demo scan <span aria-hidden="true">↗</span>
            </button>
            <span className="demo-caption">Runs axe on a local sample page</span>
          </div>
          <p className="privacy-note"><svg aria-hidden="true" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>Runs locally on this machine. Public pages only; URLs and reports are never saved.</p>

          {/* Enhanced Error Banner */}
          {error && (
            <div className="error-banner" role="alert">
              <span className="error-icon" aria-hidden="true">!</span>
              <div className="error-content">
                <div className="error-header">
                  <strong>{error.title}</strong>
                  {error.code && <span className="error-code-badge">{error.code}</span>}
                </div>
                <p className="error-message">{error.message}</p>
                {error.suggestion && (
                  <p className="error-suggestion">
                    <span className="suggestion-icon" aria-hidden="true">💡</span>
                    <span>{error.suggestion}</span>
                  </p>
                )}
                <div className="error-actions">
                  {error.failedUrl && (
                    <button
                      type="button"
                      className="error-action-button error-retry-btn"
                      onClick={() => void runScan('website', error.failedUrl)}
                      disabled={loading}
                    >
                      ↻ Try Again
                    </button>
                  )}
                  <button
                    type="button"
                    className="error-action-button error-demo-btn"
                    onClick={() => void runScan('demo')}
                    disabled={loading}
                  >
                    Try Demo Scan Instead
                  </button>
                  <button
                    type="button"
                    className="error-dismiss-btn"
                    onClick={() => setError(null)}
                    aria-label="Dismiss error"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Dynamic Multi-Stage Loading Panel */}
        {loading && (
          <section className="loading-panel" role="status" aria-live="polite" aria-label="Scan in progress">
            <div className="loading-main">
              <span className="loading-mark"><span className="spinner spinner-large" aria-hidden="true" /></span>
              <div className="loading-text">
                <h2>{loadingStage.title}</h2>
                <p>{loadingStage.desc}</p>
              </div>
              <div className="loading-timer-badge">
                <span className="timer-dot" />
                <span>{loadingElapsed}s elapsed</span>
              </div>
            </div>

            <div className="loading-steps-bar" aria-hidden="true">
              <div className={`step-item ${loadingStage.step >= 1 ? 'active' : ''}`}>
                <span className="step-circle">{loadingStage.step > 1 ? '✓' : '1'}</span>
                <span>Connect</span>
              </div>
              <div className="step-line" />
              <div className={`step-item ${loadingStage.step >= 2 ? 'active' : ''}`}>
                <span className="step-circle">{loadingStage.step > 2 ? '✓' : '2'}</span>
                <span>Load DOM</span>
              </div>
              <div className="step-line" />
              <div className={`step-item ${loadingStage.step >= 3 ? 'active' : ''}`}>
                <span className="step-circle">{loadingStage.step > 3 ? '✓' : '3'}</span>
                <span>Run Axe</span>
              </div>
              <div className="step-line" />
              <div className={`step-item ${loadingStage.step >= 4 ? 'active' : ''}`}>
                <span className="step-circle">4</span>
                <span>Evaluate</span>
              </div>
            </div>

            {loadingElapsed >= 8 && (
              <p className="loading-tip">
                ⚡ Scanning large websites (like YouTube or NASA) takes a bit longer due to extensive content and dynamic components.
              </p>
            )}
          </section>
        )}


        {!report && !loading && !error && <section className="empty-panel" aria-label="About this scan">
          <div className="empty-copy"><span className="sparkle" aria-hidden="true">✳</span><div><h2>A clear place to start</h2><p>Automated checks can catch many common issues. Some parts of accessibility still need a person to review.</p></div></div>
          <div className="legend-row"><span className="legend-item"><i className="legend-swatch red" /> Violations</span><span className="legend-item"><i className="legend-swatch amber" /> Manual review</span><span className="legend-item"><i className="legend-swatch teal" /> Passed checks</span></div>
        </section>}

        {report && <section className="results" aria-labelledby="results-title">
          <div className="results-heading">
            <div><div className="results-overline"><span className="ready-dot" /> SCAN COMPLETE</div><h2 id="results-title">Your scan results</h2></div>
            <div className="result-actions">
              <button
                className="ai-coach-trigger-btn"
                type="button"
                onClick={handleGenerateAiPlanClick}
                disabled={aiLoading}
                aria-busy={aiLoading}
              >
                {aiLoading ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    <span>Consulting Coach…</span>
                  </>
                ) : (
                  <>
                    <span className="coach-sparkle" aria-hidden="true">✦</span>
                    <span>Generate AI action plan</span>
                    {agentStatus && !agentStatus.configured && (
                      <span className="coach-setup-pill">Setup required</span>
                    )}
                  </>
                )}
              </button>
              <button
                className="secondary-button download-report-btn"
                type="button"
                onClick={downloadPdfReport}
                disabled={generatingPdf}
                title="Download full accessibility audit report as PDF"
              >
                {generatingPdf ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    <span>Generating PDF…</span>
                  </>
                ) : (
                  <>
                    <svg aria-hidden="true" viewBox="0 0 20 20">
                      <path d="M10 2.5v10m0 0 3.5-3.5M10 12.5 6.5 9M3 14v3h14v-3" />
                    </svg>
                    <span>Download report</span>
                    <span className="pdf-badge">PDF</span>
                  </>
                )}
              </button>
              <button
                className="text-button json-export-btn"
                type="button"
                onClick={downloadJson}
                title="Export raw JSON findings"
              >
                Export JSON
              </button>
              <button className="text-button" type="button" onClick={resetScan}>Scan another page <span aria-hidden="true">↗</span></button>
            </div>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            Scan complete. Audit score: {score ? score.score : 0} of 100, Grade {score ? score.grade : ''}. {report.counts.violations} violations, {report.counts.incomplete} checks for manual review, and {report.counts.passes} passed checks.
          </p>
          <div className="report-meta"><span className="meta-label">PAGE</span><span className="scanned-url" title={report.scannedUrl}>{report.scannedUrl}</span><span className="meta-separator">·</span><span>Scanned {formatDate(report.scannedAt)}</span><span className="scope-chip">ONE PAGE</span></div>
          {score && <AuditScoreCard score={score} />}

          {/* AI Accessibility Coach Action Plan Section (clearly separated from axe findings) */}
          {(aiPlan || aiLoading || aiError) && (
            <AccessibilityCoachPanel
              plan={aiPlan}
              loading={aiLoading}
              error={aiError}
              agentStatus={agentStatus}
              onDismissError={() => setAiError(null)}
              onCopySnippet={copyText}
              onRetry={() => void requestAgentPlan()}
            />
          )}

          <div className="summary-grid" aria-label="Summary counts">
            <SummaryCard category="violations" count={report.counts.violations} title="Violations" subtitle="Automated issues found" />
            <SummaryCard category="incomplete" count={report.counts.incomplete} title="Manual review" subtitle="Needs a closer look" />
            <SummaryCard category="passes" count={report.counts.passes} title="Passed checks" subtitle="Automated rules passed" />
          </div>
          {hasNoFindings && <div className="no-issues-note"><span className="no-issues-icon" aria-hidden="true">✓</span><div><strong>No automated violations found.</strong><p>This is not a full accessibility audit. Review the manual checks and test the page with people and assistive technology.</p></div></div>}
          <div className="findings-toolbar">
            <div className="filter-list" role="group" aria-label="Filter results">
              {filters.map((item) => <button key={item.id} className={`filter-chip ${filter === item.id ? 'active' : ''}`} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{countForFilter(report, item.id)}</span></button>)}
            </div>
            <label className="search-wrap"><span className="sr-only">Search findings by rule, description, selector, or WCAG tag</span><svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.7" cy="8.7" r="5.7" /><path d="m13 13 4 4" /></svg><input type="search" placeholder="Search findings…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          </div>
          <p className="result-count" aria-live="polite">Showing {findings.length} {findings.length === 1 ? 'rule' : 'rules'}{search.trim() ? ` matching “${search.trim()}”` : ''}</p>
          <div className="finding-list">
            {findings.map(({ category, finding }) => <FindingCard key={`${category}-${finding.id}`} category={category} finding={finding} onCopy={copyText} />)}
            {findings.length === 0 && <div className="no-matches"><span aria-hidden="true">⌕</span><strong>No matching findings</strong><p>Try a different search term or choose another filter.</p></div>}
          </div>
          <p className="audit-caveat">AccessScan uses automated axe-core checks. It does not replace a manual accessibility review or certify WCAG conformance.</p>
        </section>}
      </main>
      <footer className="footer"><span>ACCESSIBILITY IS A PRACTICE, NOT A SCORE.</span><span>Powered by axe-core <span className="footer-separator">·</span> Runs on your machine</span></footer>
      <div className="sr-only" role="status" aria-live="polite">{copyMessage}</div>

      {showDisclosureModal && (
        <DisclosureModal
          agentStatus={agentStatus}
          onConfirm={() => {
            setShowDisclosureModal(false);
            setDisclosureAcknowledged(true);
            void requestAgentPlan();
          }}
          onCancel={() => setShowDisclosureModal(false)}
        />
      )}
    </div>
  );
}

function AuditScoreCard({ score }: { score: AuditScore }) {
  const color = getScoreColor(score.score);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - score.score / 100);

  return (
    <div className="audit-score-card" aria-label="Accessibility Audit Score">
      <div className="audit-score-header">
        <div className="audit-score-gauge-wrap">
          <svg className="score-radial-gauge" viewBox="0 0 100 100" aria-hidden="true">
            <circle
              className="gauge-track"
              cx="50"
              cy="50"
              r={radius}
              strokeWidth="8"
            />
            <circle
              className="gauge-fill"
              cx="50"
              cy="50"
              r={radius}
              strokeWidth="8"
              stroke={color}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="gauge-text">
            <span className="gauge-score">{score.score}</span>
            <span className="gauge-max">/100</span>
          </div>
        </div>

        <div className="audit-score-summary">
          <div className="audit-score-badge-row">
            <span className={`score-grade-pill grade-${score.grade.toLowerCase().replace('+', '-plus')}`}>
              Grade {score.grade}
            </span>
            <span className="score-rating-text">{score.rating}</span>
            <span className="score-pass-chip">{score.complianceRate}% Rule Pass Rate</span>
          </div>

          <h3 className="audit-score-heading">Automated Accessibility Score</h3>
          <p className="audit-score-description">
            {score.score >= 90
              ? 'Excellent performance on automated checks. The tested page meets high automated accessibility standards.'
              : score.score >= 80
              ? 'Good accessibility baseline with a few areas to polish. Prioritize the violations below.'
              : score.score >= 70
              ? 'Moderate compliance. Important accessibility barriers were found that impact assistive technology users.'
              : 'Significant barriers identified. Users of screen readers or keyboard navigation will experience major friction.'}
          </p>

          <div className="impact-breakdown-row" aria-label="Severity impact breakdown">
            <span className={`impact-pill-badge impact-critical ${score.impacts.critical === 0 ? 'zero' : ''}`}>
              <strong>{score.impacts.critical}</strong> Critical
            </span>
            <span className={`impact-pill-badge impact-serious ${score.impacts.serious === 0 ? 'zero' : ''}`}>
              <strong>{score.impacts.serious}</strong> Serious
            </span>
            <span className={`impact-pill-badge impact-moderate ${score.impacts.moderate === 0 ? 'zero' : ''}`}>
              <strong>{score.impacts.moderate}</strong> Moderate
            </span>
            <span className={`impact-pill-badge impact-minor ${score.impacts.minor === 0 ? 'zero' : ''}`}>
              <strong>{score.impacts.minor}</strong> Minor
            </span>
            <span className="impact-elements-note">
              · {score.affectedElements} {score.affectedElements === 1 ? 'element' : 'elements'} affected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ category, count, title, subtitle }: { category: Category; count: number; title: string; subtitle: string }) {
  return <div className={`summary-card summary-${category}`}><div className="summary-top"><span className="summary-icon" aria-hidden="true">{categoryMeta[category].icon}</span><span className="summary-title">{title}</span></div><div className="summary-count">{count}</div><div className="summary-subtitle">{subtitle}</div></div>;
}

function FindingCard({ category, finding, onCopy }: { category: Category; finding: Finding; onCopy: (value: string, label: string) => Promise<void> }) {
  const meta = categoryMeta[category];
  const impact = finding.impact ? `${finding.impact[0].toUpperCase()}${finding.impact.slice(1)} impact` : 'Impact not set';
  return <article className={`finding-card finding-${category}`}>
    <details>
      <summary className="finding-summary">
        <span className="finding-status-icon" aria-hidden="true">{meta.icon}</span>
        <span className="finding-summary-copy"><span className="finding-title-row"><strong>{finding.help}</strong><span className="rule-id">{finding.id}</span></span><span className="finding-summary-desc">{finding.nodes.length} affected {finding.nodes.length === 1 ? 'element' : 'elements'} <span aria-hidden="true">·</span> {finding.description}</span></span>
        <span className={`impact-pill impact-${finding.impact ?? 'unknown'}`}>{category === 'passes' ? 'Passed' : category === 'incomplete' ? 'Review' : impact}</span>
        <svg className="chevron" aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7.5 5 5 5-5" /></svg>
      </summary>
      <div className="finding-details">
        <div className="detail-section"><h3>What this means</h3><p>{finding.description}</p></div>
        {explanations[finding.id] && <div className="detail-section plain-language"><h3>In plain language</h3><p>{explanations[finding.id]}</p></div>}
        {category === 'violations' && fixes[finding.id] && <div className="detail-section fix-guidance"><h3><span aria-hidden="true">✦</span> Suggested fix</h3><p>{fixes[finding.id]}</p><span className="guidance-note">Curated guidance · verify it fits your page</span></div>}
        <div className="detail-section"><h3>Affected elements <span className="section-count">{finding.nodes.length}</span></h3>
          {finding.nodes.map((node, index) => {
            const selector = node.target.join(', ') || 'Selector unavailable';
            return <div className="node-card" key={`${selector}-${index}`}>
              <div className="node-selector-row"><code className="selector-code">{selector}</code><button type="button" className="copy-button" onClick={() => void onCopy(selector, 'Selector')}><svg aria-hidden="true" viewBox="0 0 18 18"><rect x="6" y="5" width="9" height="10" rx="1.5"/><path d="M12 5V3.5A1.5 1.5 0 0 0 10.5 2h-7A1.5 1.5 0 0 0 2 3.5v8A1.5 1.5 0 0 0 3.5 13H6"/></svg>Copy selector</button></div>
              <pre className="html-snippet"><code>{node.html}</code></pre>
              <button type="button" className="copy-snippet" onClick={() => void onCopy(node.html, 'HTML snippet')}>Copy HTML snippet</button>
              {node.failureSummary && <p className="failure-summary">{node.failureSummary}</p>}
            </div>;
          })}
        </div>
        <div className="detail-bottom"><div className="wcag-tags"><strong>Tags</strong>{finding.tags.filter((tag) => /wcag|best-practice|section508/i.test(tag)).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div><a className="help-link" href={finding.helpUrl} target="_blank" rel="noreferrer">Read axe guidance <span aria-hidden="true">↗</span></a></div>
      </div>
    </details>
  </article>;
}

interface AccessibilityCoachPanelProps {
  plan: RemediationPlan | null;
  loading: boolean;
  error: string | null;
  agentStatus: AgentStatus | null;
  onDismissError: () => void;
  onCopySnippet: (value: string, label: string) => Promise<void>;
  onRetry: () => void;
}

function AccessibilityCoachPanel({
  plan,
  loading,
  error,
  agentStatus,
  onDismissError,
  onCopySnippet,
  onRetry,
}: AccessibilityCoachPanelProps) {
  if (loading) {
    return (
      <section className="coach-panel coach-loading-card" aria-live="polite" aria-busy="true">
        <div className="coach-loading-content">
          <div className="coach-ai-spinner">
            <span className="spinner spinner-large" aria-hidden="true" />
          </div>
          <div>
            <div className="coach-overline">
              <span className="coach-sparkle" aria-hidden="true">✦</span>
              MICROSOFT FOUNDRY AGENT SERVICE
            </div>
            <h3 className="coach-panel-title">Accessibility Coach is analyzing your audit…</h3>
            <p className="coach-panel-desc">
              The agent is executing read-only function tools to prioritize rule violations, inspect axe-core guidance, and synthesize actionable code fixes.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    const isNotConfigured = error.toLowerCase().includes('not configured');
    return (
      <section className="coach-panel coach-error-card" role="alert">
        <div className="coach-error-header">
          <span className="coach-error-icon" aria-hidden="true">
            {isNotConfigured ? 'ℹ' : '⚠'}
          </span>
          <div className="coach-error-body">
            <div className="coach-overline">
              <span className="coach-sparkle" aria-hidden="true">✦</span>
              ACCESSIBILITY COACH {isNotConfigured ? '· SETUP REQUIRED' : '· AGENT NOTICE'}
              {agentStatus?.model ? ` · ${agentStatus.model}` : ''}
            </div>
            <h3 className="coach-panel-title">
              {isNotConfigured ? 'Microsoft Foundry Agent Service Not Configured' : 'Could Not Generate AI Action Plan'}
            </h3>
            <p className="coach-error-message">{error}</p>
            {isNotConfigured ? (
              <div className="coach-config-guide">
                <strong>To enable AI action plans with Microsoft Foundry:</strong>
                <ol>
                  <li>Create a <code>.env</code> file in the project root (see <code>.env.example</code>).</li>
                  <li>Set <code>AZURE_AI_FOUNDRY_PROJECT_ENDPOINT</code> and <code>AZURE_AI_FOUNDRY_MODEL_DEPLOYMENT</code>.</li>
                  <li>Authenticate with Azure CLI (<code>az login</code>) or supply managed credentials.</li>
                  <li>Restart the backend server.</li>
                </ol>
                <p className="coach-safe-note">
                  Standard deterministic axe-core scanning and reports remain completely available without AI.
                </p>
              </div>
            ) : (
              <div className="coach-error-actions">
                <button type="button" className="coach-retry-btn" onClick={onRetry}>
                  ↻ Try Again
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="coach-dismiss-btn"
            onClick={onDismissError}
            aria-label="Dismiss AI notice"
          >
            ✕
          </button>
        </div>
      </section>
    );
  }

  if (!plan) return null;

  return (
    <section className="coach-panel coach-plan-panel" aria-labelledby="coach-plan-heading">
      <div className="coach-panel-header">
        <div className="coach-header-left">
          <div className="coach-badge-row">
            <span className="coach-badge">
              <span className="coach-sparkle" aria-hidden="true">✦</span> AI-GENERATED GUIDANCE
            </span>
            <span className="coach-model-chip">Foundry Model: {plan.model}</span>
          </div>
          <h3 id="coach-plan-heading" className="coach-plan-heading">
            Accessibility Coach Remediation Plan
          </h3>
          <p className="coach-plan-subtitle">
            Prioritized engineering action plan synthesized from deterministic axe-core scan findings.
          </p>
        </div>
        <div className="coach-meta-tag">
          Generated {formatDate(plan.generatedAt)}
        </div>
      </div>

      {/* Plan Executive Summary */}
      <div className="coach-summary-card">
        <h4 className="coach-section-heading">Executive Summary</h4>
        <p className="coach-summary-text">{plan.summary}</p>
      </div>

      {/* Prioritized Findings */}
      <div className="coach-findings-section">
        <h4 className="coach-section-heading">
          Prioritized Action Items ({plan.priorityFindings.length})
        </h4>
        <div className="coach-findings-list">
          {plan.priorityFindings.map((item, index) => {
            const impactClass = `impact-${item.impact}`;
            return (
              <article key={`${item.ruleId}-${index}`} className="coach-finding-card">
                <div className="coach-finding-header">
                  <div className="coach-priority-badge">
                    <span className="priority-rank">#{index + 1}</span>
                    <span className={`coach-impact-pill ${impactClass}`}>
                      {item.impact.toUpperCase()}
                    </span>
                  </div>
                  <div className="coach-finding-title-wrap">
                    <h5 className="coach-finding-title">{item.help}</h5>
                    <span className="coach-rule-code">{item.ruleId}</span>
                  </div>
                  <span className="coach-element-count">
                    {item.affectedElementsCount} {item.affectedElementsCount === 1 ? 'element' : 'elements'} affected
                  </span>
                </div>

                <div className="coach-why-first">
                  <strong>Why address this first:</strong> {item.whyFirst}
                </div>

                <div className="coach-steps">
                  <strong>Suggested Remediation Steps:</strong>
                  <ol>
                    {item.steps.map((step, sIdx) => (
                      <li key={sIdx}>{step}</li>
                    ))}
                  </ol>
                </div>

                {item.codeExample && (
                  <div className="coach-code-box">
                    <div className="coach-code-header">
                      <span>Compliant Markup Example</span>
                      <button
                        type="button"
                        className="coach-copy-code-btn"
                        onClick={() => void onCopySnippet(item.codeExample!, 'Code example')}
                      >
                        Copy code
                      </button>
                    </div>
                    <pre className="coach-code-pre">
                      <code>{item.codeExample}</code>
                    </pre>
                  </div>
                )}

                <div className="coach-finding-footer">
                  <div className="coach-wcag-tags">
                    {item.wcagTags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <a
                    className="help-link"
                    href={item.helpUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official axe guidance <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Manual Review Reminder & Certification Disclaimer */}
      <div className="coach-disclaimer-card">
        <div className="coach-disclaimer-icon" aria-hidden="true">⚠</div>
        <div className="coach-disclaimer-content">
          <strong>Manual Testing Required & Advisory Notice:</strong>
          <p>{plan.manualReviewNotes}</p>
          <p className="coach-no-score-note">
            Notice: This action plan contains advisory engineering guidance generated by an AI agent. It does not replace comprehensive human manual accessibility testing (screen readers, keyboard-only navigation) and does not certify WCAG conformance.
          </p>
        </div>
      </div>
    </section>
  );
}

interface DisclosureModalProps {
  agentStatus: AgentStatus | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function DisclosureModal({ agentStatus, onConfirm, onCancel }: DisclosureModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="disclosure-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-icon" aria-hidden="true">✦</div>
          <div>
            <div className="coach-overline">AI ACCESSIBILITY COACH</div>
            <h3 id="disclosure-title">AI Action Plan Notice</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onCancel}
            aria-label="Close notice"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-lead">
            The Accessibility Coach uses <strong>Microsoft Foundry Agent Service</strong> to evaluate your scan findings and generate a prioritized remediation action plan.
          </p>

          <div className="disclosure-list">
            <div className="disclosure-item">
              <span className="disclosure-bullet" aria-hidden="true">🛡</span>
              <div>
                <strong>Privacy & Untrusted Data Protection:</strong>
                <p>
                  Only axe-core rule IDs, impacted element counts, and CSS selectors are evaluated by the agent. Full HTML documents, session cookies, and credentials are <strong>never</strong> transmitted.
                </p>
              </div>
            </div>

            <div className="disclosure-item">
              <span className="disclosure-bullet" aria-hidden="true">🔒</span>
              <div>
                <strong>Backend Isolation:</strong>
                <p>
                  All credentials and model API calls run entirely on the Node.js backend. Azure secrets are never exposed to the browser.
                </p>
              </div>
            </div>

            <div className="disclosure-item">
              <span className="disclosure-bullet" aria-hidden="true">📋</span>
              <div>
                <strong>Advisory Scope:</strong>
                <p>
                  The coach provides technical recommendations and code examples. It does not replace manual assistive technology testing or constitute an official WCAG compliance certification.
                </p>
              </div>
            </div>
          </div>

          {agentStatus && !agentStatus.configured && (
            <div className="modal-warning-box">
              <span aria-hidden="true">ℹ</span>
              <div>
                <strong>Microsoft Foundry is currently not configured on this server.</strong>
                <p>You can still proceed to test the request, but an unconfigured notice will be returned unless credentials are provided in <code>.env</code>.</p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-button modal-confirm-btn" onClick={onConfirm}>
            <span aria-hidden="true">✦</span> Continue & Generate Plan
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
