import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuditScore, Category, Filter, Finding, ScanReport } from './types';
import { calculateScore, getScoreColor } from './utils/score';

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All results' },
  { id: 'violations', label: 'Violations' },
  { id: 'incomplete', label: 'Manual review' },
  { id: 'passes', label: 'Passed checks' },
];

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
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function runScan(kind: 'website' | 'demo', event?: FormEvent) {
    event?.preventDefault();
    if (loading) return;
    setError('');
    setReport(null);
    setFilter('all');
    setSearch('');
    setCopyMessage('');
    setLoading(true);
    try {
      const response = await fetch(kind === 'demo' ? '/api/demo' : '/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: kind === 'demo' ? '{}' : JSON.stringify({ url }),
      });
      const data = await response.json() as ScanReport | { error?: string };
      if (!response.ok || !('counts' in data)) {
        throw new Error('error' in data && data.error ? data.error : 'The scan could not be completed. Please try again.');
      }
      setReport(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The scan could not be completed. Please try again.');
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
    setUrl('');
    setFilter('all');
    setSearch('');
    setError('');
    inputRef.current?.focus();
  }

  const hasNoFindings = report !== null && report.counts.violations === 0 && report.counts.incomplete === 0;

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
          <p className="hero-copy">Find accessibility issues on a single webpage, with clear explanations to help you fix them.</p>
        </section>

        <section className="scan-card" aria-labelledby="scan-title">
          <div className="scan-card-heading">
            <div className="scan-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.6" /><path d="m16 16 4.1 4.1M8 11h5.6M10.8 8.2v5.6" /></svg></div>
            <div>
              <h2 id="scan-title">Check a webpage</h2>
              <p>One URL in, actionable findings out.</p>
            </div>
          </div>
          <form className="scan-form" onSubmit={(event) => void runScan('website', event)}>
            <label htmlFor="website-url">Website URL</label>
            <div className="input-row">
              <div className="url-input-wrap">
                <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17M12 3c2.4 2.4 3.6 5.4 3.6 9s-1.2 6.6-3.6 9c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z" /></svg>
                <input ref={inputRef} id="website-url" name="url" type="url" inputMode="url" autoComplete="url" placeholder="https://example.com" value={url} onChange={(event) => setUrl(event.target.value)} required disabled={loading} />
              </div>
              <button className="primary-button" type="submit" disabled={loading || !url.trim()}>
                {loading ? <><span className="spinner" aria-hidden="true" /> Scanning…</> : <>Scan website <span aria-hidden="true">→</span></>}
              </button>
            </div>
          </form>
          <div className="scan-alternative">
            <span className="alternative-note">New to AccessScan?</span>
            <button className="demo-button" type="button" onClick={() => void runScan('demo')} disabled={loading}>
              Try demo scan <span aria-hidden="true">↗</span>
            </button>
            <span className="demo-caption">Runs axe on a local sample page</span>
          </div>
          <p className="privacy-note"><svg aria-hidden="true" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>Runs locally on this machine. Scan one public page at a time; URLs and reports are not saved.</p>
          {error && <div className="error-banner" role="alert"><span className="error-icon" aria-hidden="true">!</span><div><strong>We couldn’t scan that page.</strong><p>{error}</p></div></div>}
        </section>

        {loading && <section className="loading-panel" role="status" aria-live="polite" aria-label="Scan in progress">
          <span className="loading-mark"><span className="spinner spinner-large" aria-hidden="true" /></span>
          <div><h2>Checking this page…</h2><p>AccessScan is loading the page and running automated checks. This can take a little while.</p></div>
        </section>}

        {!report && !loading && !error && <section className="empty-panel" aria-label="About this scan">
          <div className="empty-copy"><span className="sparkle" aria-hidden="true">✳</span><div><h2>A clear place to start</h2><p>Automated checks can catch many common issues. Some parts of accessibility still need a person to review.</p></div></div>
          <div className="legend-row"><span className="legend-item"><i className="legend-swatch red" /> Violations</span><span className="legend-item"><i className="legend-swatch amber" /> Manual review</span><span className="legend-item"><i className="legend-swatch teal" /> Passed checks</span></div>
        </section>}

        {report && <section className="results" aria-labelledby="results-title">
          <div className="results-heading">
            <div><div className="results-overline"><span className="ready-dot" /> SCAN COMPLETE</div><h2 id="results-title">Your scan results</h2></div>
            <div className="result-actions"><button className="secondary-button" type="button" onClick={downloadJson}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 2.5v10m0 0 3.5-3.5M10 12.5 6.5 9M3 14v3h14v-3" /></svg>Download JSON</button><button className="text-button" type="button" onClick={resetScan}>Scan another page <span aria-hidden="true">↗</span></button></div>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            Scan complete. Audit score: {score ? score.score : 0} of 100, Grade {score ? score.grade : ''}. {report.counts.violations} violations, {report.counts.incomplete} checks for manual review, and {report.counts.passes} passed checks.
          </p>
          <div className="report-meta"><span className="meta-label">PAGE</span><span className="scanned-url" title={report.scannedUrl}>{report.scannedUrl}</span><span className="meta-separator">·</span><span>Scanned {formatDate(report.scannedAt)}</span><span className="scope-chip">ONE PAGE</span></div>
          {score && <AuditScoreCard score={score} />}
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

export default App;
