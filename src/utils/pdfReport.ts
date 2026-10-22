import { jsPDF } from 'jspdf';
import type { AuditScore, Finding, RemediationPlan, ScanReport } from '../types';

interface GeneratePdfReportOptions {
  report: ScanReport;
  score?: AuditScore | null;
  aiPlan?: RemediationPlan | null;
}

const ruleGuidanceMap: Record<
  string,
  { plainLanguage: string; fix: string; wcagRef?: string }
> = {
  'image-alt': {
    plainLanguage:
      'People using screen readers rely on alternative text to understand what an image communicates. Without alt text, screen readers may announce the file path or skip the image completely.',
    fix: 'For informative images, add an alt attribute describing the image purpose (e.g., alt="Company quarterly growth chart"). For decorative images, use alt="" or aria-hidden="true".',
    wcagRef: 'WCAG 2.1 Level A — 1.1.1 Non-text Content',
  },
  label: {
    plainLanguage:
      'Form fields need programmatic labels so assistive technologies announce what input is expected. Placeholder text disappears when typing and is not an accessible label.',
    fix: 'Add a visible <label for="field-id"> corresponding to the input\'s id attribute, or supply aria-label="Field purpose" if a visual label is omitted.',
    wcagRef: 'WCAG 2.1 Level A — 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value',
  },
  'button-name': {
    plainLanguage:
      'Buttons without text or accessible names leave screen reader and speech recognition users unable to determine what action clicking the button will trigger.',
    fix: 'Place descriptive text inside the <button>, or add aria-label="Action description" on icon-only buttons.',
    wcagRef: 'WCAG 2.1 Level A — 4.1.2 Name, Role, Value',
  },
  'link-name': {
    plainLanguage:
      'Links must have discernible text so users understand where following the link will take them. Empty links or icon-only links without accessible names break navigation.',
    fix: 'Include visible, descriptive text inside the <a> tag (avoid "click here"), or add aria-label="Destination title" for icon links.',
    wcagRef: 'WCAG 2.1 Level A — 2.4.4 Link Purpose (In Context), 4.1.2 Name, Role, Value',
  },
  'color-contrast': {
    plainLanguage:
      'Text must contrast sufficiently with its background to be readable by individuals with low vision, color blindness, or in high-glare environments.',
    fix: 'Increase foreground/background contrast to meet minimum 4.5:1 for normal text (18px / 14pt bold and smaller) and 3:1 for large text.',
    wcagRef: 'WCAG 2.1 Level AA — 1.4.3 Contrast (Minimum)',
  },
  'document-title': {
    plainLanguage:
      'A descriptive page title is the very first thing announced by screen readers when navigating to a new page and identifies the tab in browser title bars.',
    fix: 'Add a concise, unique, and descriptive <title> tag inside the document <head>.',
    wcagRef: 'WCAG 2.1 Level A — 2.4.2 Page Titled',
  },
  'html-has-lang': {
    plainLanguage:
      'The <html> element must have a language attribute so screen readers apply the correct speech synthesizer pronunciation and hyphenation rules.',
    fix: 'Add a lang attribute to the root element, e.g. <html lang="en">.',
    wcagRef: 'WCAG 2.1 Level A — 3.1.1 Language of Page',
  },
  'html-lang-valid': {
    plainLanguage:
      'The lang attribute value on the <html> tag must be a recognized BCP 47 language code.',
    fix: 'Use a standard two-letter or four-letter language code (e.g., lang="en" or lang="en-US").',
    wcagRef: 'WCAG 2.1 Level A — 3.1.1 Language of Page',
  },
  'aria-allowed-role': {
    plainLanguage:
      'ARIA roles tell assistive technology what an element does. Assigning a role that conflicts with the HTML tag semantics confuses screen readers.',
    fix: 'Ensure ARIA roles match the permitted roles for that HTML element according to the W3C ARIA specification.',
    wcagRef: 'WCAG 2.1 Level A — 4.1.2 Name, Role, Value',
  },
  'aria-roles': {
    plainLanguage:
      'The ARIA role attribute specifies a non-standard or misspelled role that assistive technologies do not recognize.',
    fix: 'Check for typos in role values and use only standard W3C ARIA roles (e.g. role="navigation", role="dialog").',
    wcagRef: 'WCAG 2.1 Level A — 4.1.2 Name, Role, Value',
  },
  'duplicate-id': {
    plainLanguage:
      'HTML id attributes must be unique on the page. Duplicate IDs break form labels, ARIA references (aria-labelledby, aria-describedby), and anchor links.',
    fix: 'Ensure each id value appears only once across the entire document DOM.',
    wcagRef: 'WCAG 2.1 Level A — 4.1.1 Parsing',
  },
  'heading-order': {
    plainLanguage:
      'Headings (h1 through h6) construct an outline of the page. Skipping heading levels (e.g. h1 directly to h4) disorients users skimming by heading.',
    fix: 'Restructure headings hierarchically so levels increase by at most one at a time (h1 -> h2 -> h3).',
    wcagRef: 'WCAG Best Practice — 1.3.1 Info and Relationships',
  },
  bypass: {
    plainLanguage:
      'Keyboard and screen reader users need a mechanism to skip repetitive navigation menus and jump directly to the primary page content.',
    fix: 'Add a visible-on-focus "Skip to main content" anchor link at the very top of the <body> linking to <main id="main-content">.',
    wcagRef: 'WCAG 2.1 Level A — 2.4.1 Bypass Blocks',
  },
  'meta-viewport': {
    plainLanguage:
      'Disabling user zoom (user-scalable=no or maximum-scale=1.0) prevents people with visual impairments from magnifying text on mobile devices.',
    fix: 'Remove user-scalable=no and ensure maximum-scale is at least 5.0 in your <meta name="viewport"> tag.',
    wcagRef: 'WCAG 2.1 Level AA — 1.4.4 Resize Text',
  },
  tabindex: {
    plainLanguage:
      'Positive tabindex values (e.g. tabindex="1") override the natural document tab order, creating confusing navigation traps for keyboard users.',
    fix: 'Remove positive tabindex values. Use tabindex="0" to include an element in natural tab order, or tabindex="-1" for programmatic focus.',
    wcagRef: 'WCAG Best Practice — 2.4.3 Focus Order',
  },
};

export function generateAccessibilityPdfReport({
  report,
  score,
  aiPlan,
}: GeneratePdfReportOptions): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2; // 178mm
  const bottomLimit = pageHeight - 20;

  let cursorY = 22;

  // Helper: check space and trigger page break if needed
  function checkPageBreak(neededHeight: number) {
    if (cursorY + neededHeight > bottomLimit) {
      doc.addPage();
      cursorY = 24;
      drawRunningHeader();
    }
  }

  // Draw header banner
  function drawRunningHeader() {
    doc.saveGraphicsState();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('ACCESSSCAN · ACCESSIBILITY AUDIT & REMEDIATION REPORT', marginX, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const dateStr = new Date(report.scannedAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    doc.text(dateStr, pageWidth - marginX, 12, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, 15, pageWidth - marginX, 15);
    doc.restoreGraphicsState();
  }

  // ----------------------------------------------------
  // 1. REPORT COVER / HEADER
  // ----------------------------------------------------
  drawRunningHeader();

  // Brand Mark & Title
  doc.setFillColor(98, 80, 230); // Primary brand purple
  doc.roundedRect(marginX, cursorY, 8, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('✓', marginX + 2.2, cursorY + 5.8);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('AccessScan Audit Report', marginX + 11, cursorY + 6.5);

  cursorY += 13;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Automated axe-core accessibility evaluation with detailed error analysis and practical fixes.',
    marginX,
    cursorY
  );
  cursorY += 8;

  // Metadata Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, cursorY, contentWidth, 22, 3, 3, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('TARGET URL / DOMAIN:', marginX + 4, cursorY + 6);
  doc.text('AUDIT TIMESTAMP:', marginX + 4, cursorY + 12);
  doc.text('EVALUATION SCOPE:', marginX + 4, cursorY + 18);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const displayUrl =
    report.scannedUrl.length > 70
      ? report.scannedUrl.slice(0, 68) + '…'
      : report.scannedUrl;
  doc.text(displayUrl, marginX + 42, cursorY + 6);
  doc.text(new Date(report.scannedAt).toLocaleString(), marginX + 42, cursorY + 12);
  doc.text(
    report.source === 'website'
      ? 'Public Webpage (Chromium Headless Session)'
      : 'Local Demo Suite (Accessible fixture)',
    marginX + 42,
    cursorY + 18
  );

  cursorY += 28;

  // ----------------------------------------------------
  // 2. AUDIT SCORE & COMPLIANCE SUMMARY
  // ----------------------------------------------------
  checkPageBreak(40);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('Executive Audit Summary', marginX, cursorY);
  cursorY += 6;

  // Summary box
  const boxHeight = 28;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, cursorY, contentWidth, boxHeight, 3, 3, 'FD');

  const colW = contentWidth / 4;

  // Column 1: Overall Score
  const scoreNum = score?.score ?? 0;
  const gradeStr = score?.grade ?? 'B';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(scoreNum >= 80 ? 16 : scoreNum >= 60 ? 180 : 220, scoreNum >= 80 ? 149 : scoreNum >= 60 ? 83 : 38, scoreNum >= 80 ? 106 : scoreNum >= 60 ? 9 : 38);
  doc.text(`${scoreNum}/100`, marginX + 6, cursorY + 11);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Grade ${gradeStr} · ${score?.rating ?? 'Automated Audit'}`, marginX + 6, cursorY + 17);
  doc.text(`${score?.complianceRate ?? 0}% Rule Pass Rate`, marginX + 6, cursorY + 22);

  // Column 2: Violations
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(220, 38, 38); // Red
  doc.text(String(report.counts.violations), marginX + colW + 6, cursorY + 11);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('VIOLATIONS', marginX + colW + 6, cursorY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text('Immediate Barriers', marginX + colW + 6, cursorY + 22);

  // Column 3: Manual Review
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(180, 83, 9); // Amber
  doc.text(String(report.counts.incomplete), marginX + colW * 2 + 6, cursorY + 11);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('NEEDS REVIEW', marginX + colW * 2 + 6, cursorY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text('Human Check Needed', marginX + colW * 2 + 6, cursorY + 22);

  // Column 4: Passed
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(4, 120, 87); // Teal
  doc.text(String(report.counts.passes), marginX + colW * 3 + 6, cursorY + 11);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PASSED RULES', marginX + colW * 3 + 6, cursorY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text('Automated Checks', marginX + colW * 3 + 6, cursorY + 22);

  cursorY += boxHeight + 6;

  // Severity Breakdown Row
  if (score?.impacts) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const impText = `Severity Breakdown: ${score.impacts.critical} Critical  |  ${score.impacts.serious} Serious  |  ${score.impacts.moderate} Moderate  |  ${score.impacts.minor} Minor  —  Total Affected Elements: ${score.affectedElements}`;
    doc.text(impText, marginX, cursorY);
    cursorY += 8;
  }

  // ----------------------------------------------------
  // 3. AI ACCESSIBILITY COACH ACTION PLAN (IF AVAILABLE)
  // ----------------------------------------------------
  if (aiPlan) {
    checkPageBreak(50);
    doc.setFillColor(245, 243, 255);
    doc.setDrawColor(196, 181, 253);
    doc.setLineWidth(0.4);
    doc.roundedRect(marginX, cursorY, contentWidth, 12, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(109, 40, 217);
    doc.text('✦ ACCESSIBILITY COACH REMEDIATION PLAN (MICROSOFT FOUNDRY AGENT)', marginX + 4, cursorY + 7);
    cursorY += 16;

    // Plan Summary Box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text('Remediation Strategy Overview:', marginX, cursorY);
    cursorY += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const summaryLines = doc.splitTextToSize(aiPlan.summary, contentWidth);
    checkPageBreak(summaryLines.length * 4);
    doc.text(summaryLines, marginX, cursorY);
    cursorY += summaryLines.length * 4 + 6;

    // AI Prioritized Items
    if (aiPlan.priorityFindings && aiPlan.priorityFindings.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(`Prioritized Action Items (${aiPlan.priorityFindings.length}):`, marginX, cursorY);
      cursorY += 5;

      aiPlan.priorityFindings.forEach((item, idx) => {
        checkPageBreak(35);

        // Header line
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(marginX, cursorY, contentWidth, 7, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(109, 40, 217);
        doc.text(`#${idx + 1} Priority [${item.impact.toUpperCase()}]`, marginX + 3, cursorY + 4.8);

        doc.setTextColor(15, 23, 42);
        doc.text(item.help, marginX + 40, cursorY + 4.8);

        cursorY += 10;

        // Why first
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('Why First:', marginX + 3, cursorY);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const whyLines = doc.splitTextToSize(item.whyFirst, contentWidth - 24);
        checkPageBreak(whyLines.length * 3.8);
        doc.text(whyLines, marginX + 22, cursorY);
        cursorY += whyLines.length * 3.8 + 3;

        // Steps
        if (item.steps && item.steps.length > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          doc.text('Action Steps:', marginX + 3, cursorY);
          cursorY += 4;

          item.steps.forEach((step, sIdx) => {
            const stepLines = doc.splitTextToSize(`${sIdx + 1}. ${step}`, contentWidth - 8);
            checkPageBreak(stepLines.length * 3.8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(51, 65, 85);
            doc.text(stepLines, marginX + 6, cursorY);
            cursorY += stepLines.length * 3.8 + 1.5;
          });
        }

        // Code Example
        if (item.codeExample) {
          checkPageBreak(18);
          doc.setFillColor(15, 23, 42); // Dark terminal background
          doc.roundedRect(marginX + 3, cursorY, contentWidth - 6, 12, 1.5, 1.5, 'F');
          doc.setFont('courier', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(103, 232, 249); // Cyan
          const codeSnippet = item.codeExample.replace(/\n/g, ' ').slice(0, 85);
          doc.text(codeSnippet, marginX + 6, cursorY + 7);
          cursorY += 15;
        }

        cursorY += 2;
      });
    }

    cursorY += 4;
  }

  // ----------------------------------------------------
  // 4. DETAILED VIOLATIONS ANALYSIS & FIXES
  // ----------------------------------------------------
  checkPageBreak(30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`Detailed Violations & Fix Guidance (${report.violations.length})`, marginX, cursorY);
  cursorY += 7;

  if (report.violations.length === 0) {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(marginX, cursorY, contentWidth, 14, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(6, 95, 70);
    doc.text('✓ No automated violations detected on this page.', marginX + 6, cursorY + 8.5);
    cursorY += 20;
  } else {
    report.violations.forEach((violation: Finding, index: number) => {
      checkPageBreak(45);

      const impact = (violation.impact?.toLowerCase() ?? 'minor') as 'critical' | 'serious' | 'moderate' | 'minor';
      const guidance = ruleGuidanceMap[violation.id];

      // Finding Header Bar
      const headerH = 8;
      const isCritical = impact === 'critical';
      const isSerious = impact === 'serious';

      doc.setFillColor(
        isCritical ? 254 : isSerious ? 254 : 243,
        isCritical ? 242 : isSerious ? 243 : 232,
        isCritical ? 242 : isSerious ? 199 : 255
      );
      doc.setDrawColor(
        isCritical ? 239 : isSerious ? 245 : 192,
        isCritical ? 68 : isSerious ? 158 : 132,
        isCritical ? 68 : isSerious ? 11 : 252
      );
      doc.setLineWidth(0.4);
      doc.roundedRect(marginX, cursorY, contentWidth, headerH, 1.5, 1.5, 'FD');

      // Severity Tag
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(
        isCritical ? 185 : isSerious ? 180 : 126,
        isCritical ? 28 : isSerious ? 83 : 34,
        isCritical ? 28 : isSerious ? 9 : 206
      );
      doc.text(`[${impact.toUpperCase()}]`, marginX + 3, cursorY + 5.5);

      // Title & Rule Code
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(8.5);
      doc.text(`${index + 1}. ${violation.help}`, marginX + 26, cursorY + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`(rule: ${violation.id})`, pageWidth - marginX - 4, cursorY + 5.5, { align: 'right' });

      cursorY += headerH + 4;

      // Plain language / description
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('What this means:', marginX + 2, cursorY);
      cursorY += 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      const descText = guidance?.plainLanguage || violation.description;
      const descLines = doc.splitTextToSize(descText, contentWidth - 4);
      checkPageBreak(descLines.length * 3.8);
      doc.text(descLines, marginX + 4, cursorY);
      cursorY += descLines.length * 3.8 + 3;

      // Practical Fix Guidance
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(16, 149, 106); // Green / Fix color
      doc.text('✦ Suggested Practical Fix:', marginX + 2, cursorY);
      cursorY += 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      const fixText =
        guidance?.fix ||
        'Review the affected elements in your HTML template and update markup to conform to standard accessible patterns.';
      const fixLines = doc.splitTextToSize(fixText, contentWidth - 4);
      checkPageBreak(fixLines.length * 3.8);
      doc.text(fixLines, marginX + 4, cursorY);
      cursorY += fixLines.length * 3.8 + 4;

      // Affected Elements (up to 3 sample nodes)
      if (violation.nodes && violation.nodes.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Affected Elements (${violation.nodes.length} total):`,
          marginX + 2,
          cursorY
        );
        cursorY += 3.5;

        const maxNodes = Math.min(violation.nodes.length, 3);
        for (let n = 0; n < maxNodes; n++) {
          const node = violation.nodes[n];
          checkPageBreak(16);

          // Selector code pill
          const selector = node.target.join(' ') || 'target element';
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(marginX + 4, cursorY, contentWidth - 8, 5, 1, 1, 'F');
          doc.setFont('courier', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(71, 85, 105);
          doc.text(selector.slice(0, 95), marginX + 6, cursorY + 3.6);
          cursorY += 6.5;

          // HTML snippet
          if (node.html) {
            doc.setFillColor(15, 23, 42);
            doc.roundedRect(marginX + 4, cursorY, contentWidth - 8, 6, 1, 1, 'F');
            doc.setFont('courier', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(103, 232, 249);
            const cleanHtml = node.html.replace(/\s+/g, ' ').slice(0, 110);
            doc.text(cleanHtml, marginX + 6, cursorY + 4.2);
            cursorY += 7.5;
          }
        }
      }

      // WCAG & Reference Link
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      const wcagTags = violation.tags
        .filter((t: string) => /wcag|section508|best-practice/i.test(t))
        .join(', ');
      doc.text(`Standards: ${wcagTags || 'WCAG 2.1 A/AA'}  |  Reference: ${violation.helpUrl}`, marginX + 2, cursorY);
      cursorY += 8;

      // Divider between findings
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.3);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      cursorY += 6;
    });
  }

  // ----------------------------------------------------
  // 5. CHECKS REQUIRING MANUAL HUMAN REVIEW
  // ----------------------------------------------------
  if (report.incomplete.length > 0) {
    checkPageBreak(30);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`Checks Requiring Manual Review (${report.incomplete.length})`, marginX, cursorY);
    cursorY += 6;

    report.incomplete.slice(0, 8).forEach((item: Finding, idx: number) => {
      checkPageBreak(18);

      doc.setFillColor(254, 252, 232);
      doc.setDrawColor(254, 240, 138);
      doc.setLineWidth(0.3);
      doc.roundedRect(marginX, cursorY, contentWidth, 12, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(161, 98, 7);
      doc.text(`[MANUAL REVIEW] ${idx + 1}. ${item.help}`, marginX + 3, cursorY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const incDesc = doc.splitTextToSize(item.description, contentWidth - 10);
      doc.text(incDesc[0] ?? item.description, marginX + 3, cursorY + 9.5);

      cursorY += 15;
    });
  }

  // ----------------------------------------------------
  // 6. PASSED CHECKS SUMMARY
  // ----------------------------------------------------
  if (report.passes.length > 0) {
    checkPageBreak(25);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`Passed Accessibility Rules (${report.passes.length})`, marginX, cursorY);
    cursorY += 6;

    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.setLineWidth(0.3);
    const passBoxH = Math.min(22, 6 + Math.ceil(report.passes.length / 3) * 4);
    doc.roundedRect(marginX, cursorY, contentWidth, passBoxH, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(21, 128, 61);

    const passNames = report.passes.slice(0, 15).map((p: Finding) => `✓ ${p.id}`).join('   ');
    const passLines = doc.splitTextToSize(passNames, contentWidth - 6);
    doc.text(passLines, marginX + 3, cursorY + 5);

    cursorY += passBoxH + 8;
  }

  // ----------------------------------------------------
  // 7. COMPLIANCE & LEGAL DISCLAIMER
  // ----------------------------------------------------
  checkPageBreak(25);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, cursorY, contentWidth, 20, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('METHODOLOGY & CONFORMANCE DISCLAIMER:', marginX + 4, cursorY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const disclaimer =
    'This audit report was generated automatically using axe-core and browser automation. Automated testing covers approximately 30% to 40% of WCAG criteria. This document provides engineering guidance and does NOT certify legal compliance with WCAG, ADA Title III, Section 508, or EN 301 549. Comprehensive audits require human evaluation with screen readers and keyboard navigation.';
  const disLines = doc.splitTextToSize(disclaimer, contentWidth - 8);
  doc.text(disLines, marginX + 4, cursorY + 10);

  // ----------------------------------------------------
  // FOOTERS ON ALL PAGES
  // ----------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.saveGraphicsState();

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('AccessScan · Accessibility is a practice, not a score', marginX, pageHeight - 7);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX, pageHeight - 7, { align: 'right' });

    doc.restoreGraphicsState();
  }

  // Trigger download in user browser
  const dateStamp = new Date(report.scannedAt)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  const sanitizedHost = report.scannedUrl
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .slice(0, 25);
  const filename = `accessscan-report-${sanitizedHost}-${dateStamp}.pdf`;

  doc.save(filename);
}
