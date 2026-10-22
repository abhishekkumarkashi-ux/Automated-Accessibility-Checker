export interface RuleGuidance {
  ruleId: string;
  description: string;
  wcagTags: string[];
  helpUrl: string;
  plainLanguageExplanation: string;
  suggestedFix: string;
  exampleSnippet?: {
    nonCompliant: string;
    compliant: string;
  };
}

export const curatedRuleGuidance: Record<string, Omit<RuleGuidance, 'ruleId'>> = {
  'image-alt': {
    description: 'Ensures <img> elements have alternate text or a role of none or presentation.',
    wcagTags: ['wcag2a', 'wcag111', 'section508'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
    plainLanguageExplanation:
      'People using screen readers cannot see images. Meaningful images require a text equivalent, while decorative images should explicitly use alt="".',
    suggestedFix:
      'For informative images, add an alt attribute describing the image purpose. For decorative images, add alt="" or aria-hidden="true".',
    exampleSnippet: {
      nonCompliant: '<img src="profile.jpg">',
      compliant: '<img src="profile.jpg" alt="Profile photo of Jane Doe">',
    },
  },
  label: {
    description: 'Ensures every form element has a label.',
    wcagTags: ['wcag2a', 'wcag412', 'wcag131', 'section508'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
    plainLanguageExplanation:
      'Form fields need programmatic labels so assistive technologies announce what input is expected. Placeholder text disappears when typing and is not an accessible label.',
    suggestedFix:
      'Add a visible <label for="field-id"> corresponding to the input id, or provide an aria-label if a visible label is visually omitted.',
    exampleSnippet: {
      nonCompliant: '<input type="text" placeholder="Search...">',
      compliant: '<label for="search-input">Search query</label>\n<input id="search-input" type="text">',
    },
  },
  'button-name': {
    description: 'Ensures buttons have discernible text.',
    wcagTags: ['wcag2a', 'wcag412', 'section508'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name',
    plainLanguageExplanation:
      'Buttons without text or accessible names leave screen reader and speech recognition users unable to determine what action will occur.',
    suggestedFix:
      'Place descriptive text inside the <button>, or provide aria-label="Action Name" on icon-only buttons.',
    exampleSnippet: {
      nonCompliant: '<button><svg>...</svg></button>',
      compliant: '<button aria-label="Close menu"><svg aria-hidden="true">...</svg></button>',
    },
  },
  'link-name': {
    description: 'Ensures links have discernible text.',
    wcagTags: ['wcag2a', 'wcag244', 'wcag412', 'section508'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/link-name',
    plainLanguageExplanation:
      'Links must clearly indicate their destination or purpose so users can navigate confidently.',
    suggestedFix:
      'Include meaningful link text inside the <a> tag, or add aria-label when the link contains only an icon or image.',
    exampleSnippet: {
      nonCompliant: '<a href="/help"><i class="icon-help"></i></a>',
      compliant: '<a href="/help" aria-label="Help Center"><i class="icon-help" aria-hidden="true"></i></a>',
    },
  },
  'color-contrast': {
    description: 'Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratios.',
    wcagTags: ['wcag2aa', 'wcag143'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
    plainLanguageExplanation:
      'Text must contrast sufficiently with its background (at least 4.5:1 for regular text and 3:1 for large text) to be readable by users with low vision or in varying lighting conditions.',
    suggestedFix:
      'Darken the text color on light backgrounds or lighten the text color on dark backgrounds until the contrast ratio meets WCAG AA standards.',
    exampleSnippet: {
      nonCompliant: 'color: #999999; background: #ffffff; /* 2.8:1 - fails */',
      compliant: 'color: #595959; background: #ffffff; /* 7.0:1 - passes */',
    },
  },
  'document-title': {
    description: 'Ensures each HTML document contains a non-empty <title> element.',
    wcagTags: ['wcag2a', 'wcag242'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/document-title',
    plainLanguageExplanation:
      'A page title is the first thing read by screen readers when navigating to a page and identifies the page in browser tabs.',
    suggestedFix:
      'Add a descriptive, page-specific <title> inside the <head> element.',
    exampleSnippet: {
      nonCompliant: '<head><title></title></head>',
      compliant: '<head><title>Accessibility Audit Report - AccessScan</title></head>',
    },
  },
  'html-has-lang': {
    description: 'Ensures every HTML document has a lang attribute.',
    wcagTags: ['wcag2a', 'wcag311'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/html-has-lang',
    plainLanguageExplanation:
      'Screen readers use the lang attribute to pronounce text with the correct language rules and accent.',
    suggestedFix:
      'Add a valid BCP 47 language code attribute to the <html> root element (e.g., <html lang="en">).',
    exampleSnippet: {
      nonCompliant: '<html>',
      compliant: '<html lang="en">',
    },
  },
  'heading-order': {
    description: 'Ensures the order of headings is semantically correct.',
    wcagTags: ['best-practice'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/heading-order',
    plainLanguageExplanation:
      'Headings provide an outline of the page. Skipping levels (like jumping from <h1> directly to <h3>) confuses assistive technology users navigating by headings.',
    suggestedFix:
      'Structure headings sequentially without skipping levels (h1 followed by h2, then h3).',
  },
  'aria-allowed-attr': {
    description: 'Ensures an element\'s role supports its ARIA attributes.',
    wcagTags: ['wcag2a', 'wcag412'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/aria-allowed-attr',
    plainLanguageExplanation:
      'ARIA attributes can only be used on elements whose role supports them. Using unsupported attributes can lead to broken accessibility trees.',
    suggestedFix:
      'Check ARIA specifications for the element role and remove attributes that are not supported or redefine the element role.',
  },
  'duplicate-id': {
    description: 'Ensures every id attribute value is unique on the page.',
    wcagTags: ['wcag2a', 'wcag411'],
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/duplicate-id',
    plainLanguageExplanation:
      'Duplicate IDs cause form labels, aria-labelledby references, and scripts to associate with the wrong elements.',
    suggestedFix:
      'Ensure every id attribute in the HTML document is globally unique.',
  },
};

/**
 * Retrieves rule guidance for a given axe-core rule ID.
 */
export function getAxeRuleGuidance(ruleId: string, fallbackDescription?: string, fallbackTags?: string[], fallbackHelpUrl?: string): RuleGuidance {
  const normalizedId = ruleId.trim().toLowerCase();
  const curated = curatedRuleGuidance[normalizedId];

  if (curated) {
    return {
      ruleId: normalizedId,
      description: curated.description,
      wcagTags: curated.wcagTags,
      helpUrl: curated.helpUrl,
      plainLanguageExplanation: curated.plainLanguageExplanation,
      suggestedFix: curated.suggestedFix,
      exampleSnippet: curated.exampleSnippet,
    };
  }

  return {
    ruleId: normalizedId,
    description: fallbackDescription || `Automated accessibility rule check for ${normalizedId}.`,
    wcagTags: fallbackTags || ['wcag2a'],
    helpUrl: fallbackHelpUrl || `https://dequeuniversity.com/rules/axe/4.10/${encodeURIComponent(normalizedId)}`,
    plainLanguageExplanation: `Check that elements conform to standard accessible markup guidelines for ${normalizedId}.`,
    suggestedFix: `Inspect the affected HTML elements and adjust attributes or structure to satisfy WCAG guidelines.`,
  };
}
