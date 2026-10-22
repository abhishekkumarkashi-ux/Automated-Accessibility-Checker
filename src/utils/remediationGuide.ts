export interface RuleRemediation {
  ruleId: string;
  wcagCriterion: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  title: string;
  impactExplanation: string;
  beforeCode: string;
  afterCode: string;
  verificationSteps: string[];
}

export const REMEDIATION_DATABASE: Record<string, RuleRemediation> = {
  'color-contrast': {
    ruleId: 'color-contrast',
    wcagCriterion: 'WCAG 2.1 SC 1.4.3 Contrast (Minimum)',
    wcagLevel: 'AA',
    title: 'Text elements must have sufficient color contrast against background',
    impactExplanation:
      'Users with low vision, color blindness, or those viewing screens in bright sunlight cannot read low-contrast text.',
    beforeCode: `/* BAD: Light gray text on white (contrast ratio: 2.1:1 - FAILS) */
.subtext {
  color: #999999;
  background-color: #ffffff;
}`,
    afterCode: `/* GOOD: Meets WCAG AA minimum 4.5:1 ratio for standard text */
.subtext {
  color: #595959; /* Contrast ratio: 7.0:1 */
  background-color: #ffffff;
}`,
    verificationSteps: [
      'Use the browser DevTools inspect element to check the rendered contrast ratio.',
      'Ensure standard text is at least 4.5:1, and large text (18pt+ or bold 14pt+) is at least 3.0:1.',
      'Test your colors using a contrast checker like WebAIM or Polypane.',
    ],
  },

  'image-alt': {
    ruleId: 'image-alt',
    wcagCriterion: 'WCAG 2.1 SC 1.1.1 Non-text Content',
    wcagLevel: 'A',
    title: 'Informative images must have descriptive alternative text',
    impactExplanation:
      'Blind and low-vision screen reader users rely on alt text to understand the content and purpose of images on the page.',
    beforeCode: `<!-- BAD: Missing alt, or generic filename -->
<img src="chart-q3.png">
<img src="photo.jpg" alt="photo.jpg">`,
    afterCode: `<!-- GOOD: Informative image describes the data or scene -->
<img src="chart-q3.png" alt="Bar chart showing Q3 revenue increased by 24% to $1.2M">

<!-- GOOD: Decorative images should have empty alt so screen readers skip them -->
<img src="decorative-blob.svg" alt="" role="presentation">`,
    verificationSteps: [
      'Ensure every <img> tag has an alt attribute present.',
      'Check that informative images accurately describe their content or function.',
      'Check that purely decorative background icons have alt="" so screen readers do not announce raw filenames.',
    ],
  },

  'document-title': {
    ruleId: 'document-title',
    wcagCriterion: 'WCAG 2.1 SC 2.4.2 Page Titled',
    wcagLevel: 'A',
    title: 'Each webpage must have a unique, descriptive <title> in <head>',
    impactExplanation:
      'The document title is the very first thing announced by screen readers when navigating to a new page or tab.',
    beforeCode: `<!-- BAD: Empty title or generic site-wide title without context -->
<title></title>
<!-- or simply: <title>Welcome</title> -->`,
    afterCode: `<!-- GOOD: Clear, descriptive page topic followed by site name -->
<title>Billing Settings - Acme Cloud Dashboard</title>`,
    verificationSteps: [
      'Inspect the <head> element and verify <title> is present and non-empty.',
      'Verify that navigating across subpages dynamically updates the document title in SPAs.',
    ],
  },

  'html-has-lang': {
    ruleId: 'html-has-lang',
    wcagCriterion: 'WCAG 2.1 SC 3.1.1 Language of Page',
    wcagLevel: 'A',
    title: 'The <html> root element must specify a valid language code',
    impactExplanation:
      'Screen readers use the lang attribute to select the correct speech synthesizer voice, pronunciation, and dictionary rules.',
    beforeCode: `<!-- BAD: Missing lang attribute -->
<html>`,
    afterCode: `<!-- GOOD: Standard BCP 47 language code -->
<html lang="en">
<!-- For specific dialects: <html lang="en-US"> or <html lang="es"> -->`,
    verificationSteps: [
      'Inspect the root <html> tag in the DOM.',
      'Verify that lang="xx" is defined with a valid ISO language code.',
    ],
  },

  'link-name': {
    ruleId: 'link-name',
    wcagCriterion: 'WCAG 2.1 SC 2.4.4 Link Purpose (In Context)',
    wcagLevel: 'A',
    title: 'Links must have discernible, meaningful text explaining their destination',
    impactExplanation:
      'Screen reader users often pull up a list of links out of context. Ambiguous links like "Click here" or empty icon links are unusable.',
    beforeCode: `<!-- BAD: Ambiguous or empty icon link -->
<a href="/pricing">Click here</a>
<a href="/profile"><i class="fa fa-user"></i></a>`,
    afterCode: `<!-- GOOD: Meaningful text or aria-label for icon links -->
<a href="/pricing">View enterprise pricing plans</a>
<a href="/profile" aria-label="View your account profile">
  <i class="fa fa-user" aria-hidden="true"></i>
</a>`,
    verificationSteps: [
      'Press Tab to navigate through all links on the page.',
      'Listen with a screen reader to confirm the destination is clear without reading surrounding text.',
    ],
  },

  'button-name': {
    ruleId: 'button-name',
    wcagCriterion: 'WCAG 2.1 SC 4.1.2 Name, Role, Value',
    wcagLevel: 'A',
    title: 'Buttons must have an accessible name for screen readers',
    impactExplanation:
      'Icon-only buttons without text (such as close modals, hamburger menus, search icons) are announced as "button" with no purpose.',
    beforeCode: `<!-- BAD: Icon-only button with no accessible text -->
<button class="icon-btn">
  <svg class="search-icon"></svg>
</button>`,
    afterCode: `<!-- GOOD: Accessible name via aria-label or visually-hidden span -->
<button class="icon-btn" aria-label="Search website">
  <svg class="search-icon" aria-hidden="true"></svg>
</button>`,
    verificationSteps: [
      'Inspect the button in browser accessibility tree to ensure "Name" is defined.',
      'Verify the button can be triggered via Enter and Space keyboard keys.',
    ],
  },

  'heading-order': {
    ruleId: 'heading-order',
    wcagCriterion: 'WCAG 2.1 SC 1.3.1 Info and Relationships',
    wcagLevel: 'A',
    title: 'Headings must follow a logical, descending hierarchy without skipping levels',
    impactExplanation:
      'Screen reader users rely on heading levels (H1 -> H2 -> H3) to build a mental outline of the page and jump between sections.',
    beforeCode: `<!-- BAD: Skipping heading level from h1 directly to h4 -->
<h1>Account Overview</h1>
<h4>Security Settings</h4>`,
    afterCode: `<!-- GOOD: Sequential hierarchy without skipping levels -->
<h1>Account Overview</h1>
<h2>Security Settings</h2>
<h3>Two-Factor Authentication</h3>`,
    verificationSteps: [
      'Run an outline test or use heading navigation keys (H key in NVDA/VoiceOver) to confirm order.',
      'Use CSS classes for visual sizing if a smaller appearance is needed without skipping semantic levels.',
    ],
  },

  label: {
    ruleId: 'label',
    wcagCriterion: 'WCAG 2.1 SC 1.3.1 & 3.3.2 Labels or Instructions',
    wcagLevel: 'A',
    title: 'Form controls must have explicit, associated text labels',
    impactExplanation:
      'Without an associated label, users cannot determine what data is required when focusing on form fields.',
    beforeCode: `<!-- BAD: Placeholder is not a replacement for a label -->
<input type="text" placeholder="Enter your email">`,
    afterCode: `<!-- GOOD: Explicit label with matching for/id association -->
<label for="user-email">Email Address</label>
<input type="email" id="user-email" name="email" required>`,
    verificationSteps: [
      'Click on the text label in the browser: the corresponding input field should automatically receive focus.',
      'Ensure the label remains visible when the input field is filled.',
    ],
  },

  'meta-viewport': {
    ruleId: 'meta-viewport',
    wcagCriterion: 'WCAG 2.1 SC 1.4.4 Resize Text',
    wcagLevel: 'AA',
    title: 'Mobile viewport must allow users to zoom and scale up to at least 200%',
    impactExplanation:
      'Restricting zoom prevents low-vision users from enlarging text and controls on mobile devices.',
    beforeCode: `<!-- BAD: Disabling user pinch-to-zoom -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0">`,
    afterCode: `<!-- GOOD: Allows responsive scaling up to at least 200%-500% -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    verificationSteps: [
      'Inspect the <meta name="viewport"> tag in <head>.',
      'Remove user-scalable=no and maximum-scale=1.0.',
      'Verify on a touch device that pinch-to-zoom works smoothly.',
    ],
  },

  bypass: {
    ruleId: 'bypass',
    wcagCriterion: 'WCAG 2.1 SC 2.4.1 Bypass Blocks',
    wcagLevel: 'A',
    title: 'Provide a skip link allowing keyboard users to bypass repetitive navigation',
    impactExplanation:
      'Keyboard and switch-device users should not be forced to tab through dozens of navigation links on every new page before reaching the main content.',
    beforeCode: `<!-- BAD: No skip navigation link before header menus -->
<header>
  <nav><a href="...">Home</a> ... [40 links] ... </nav>
</header>`,
    afterCode: `<!-- GOOD: Skip link is the first focusable element on the page -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<main id="main-content" tabindex="-1">
  <!-- Primary content -->
</main>`,
    verificationSteps: [
      'Refresh the page and press Tab once: the "Skip to main content" link should appear visually.',
      'Press Enter: keyboard focus should immediately move directly into the <main> container.',
    ],
  },
};

/**
 * Returns detailed remediation guide for any axe rule, with fallback for rules not explicitly in dictionary
 */
export function getRemediationGuide(ruleId: string, help?: string, helpUrl?: string): RuleRemediation {
  if (REMEDIATION_DATABASE[ruleId]) {
    return REMEDIATION_DATABASE[ruleId];
  }

  return {
    ruleId,
    wcagCriterion: 'WCAG 2.1 / 2.2 Success Criterion',
    wcagLevel: 'AA',
    title: help || `Fix accessibility violation: ${ruleId}`,
    impactExplanation:
      'Resolving this issue ensures that assistive technologies (screen readers, keyboard navigators, screen magnifiers) can accurately parse and interact with this element.',
    beforeCode: `<!-- Issue detected on element: ${ruleId} -->
<!-- Check element markup and inspect failure summary -->`,
    afterCode: `<!-- Recommended fix: Follow WCAG guidelines -->
<!-- Ensure valid semantics, accessible labels, and keyboard operability -->`,
    verificationSteps: [
      `Review documentation at: ${helpUrl || 'https://www.w3.org/WAI/WCAG21/quickref/'}`,
      'Apply suggested semantic attributes or color adjustments.',
      'Re-scan the page with AccessScan to confirm the violation is resolved.',
    ],
  };
}
