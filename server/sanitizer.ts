/**
 * Data Sanitizer & Privacy Redaction Module
 * 
 * Redacts sensitive user data, credentials, auth tokens, emails, and payment cards
 * from HTML snippets and selector targets before storing or exporting reports.
 */

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g;
const BEARER_AUTH_REGEX = /Bearer\s+[A-Za-z0-9-._~+/]+=*/gi;
const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

/**
 * Sanitizes an HTML snippet or attribute string to prevent leaking sensitive information in audit reports.
 */
export function sanitizeHtmlSnippet(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let sanitized = html;

  // Redact authorization tokens
  sanitized = sanitized.replace(JWT_TOKEN_REGEX, '[REDACTED_JWT_TOKEN]');
  sanitized = sanitized.replace(BEARER_AUTH_REGEX, 'Bearer [REDACTED_TOKEN]');

  // Redact emails
  sanitized = sanitized.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');

  // Redact potential credit card numbers
  sanitized = sanitized.replace(CREDIT_CARD_REGEX, '[REDACTED_CARD_NUMBER]');

  // Redact input values in sensitive form controls (password, card, ssn, pin, token, secret)
  sanitized = sanitized.replace(
    /(<input[^>]*(?:type=["'](?:password|hidden)["']|name=["'][^"']*(?:pass|token|secret|cvv|card|ssn|auth)[^"']*)[^>]*?)(value|placeholder)=["'][^"']*["']/gi,
    '$1$2="[REDACTED_VALUE]"'
  );

  // Redact explicit inline password attributes
  sanitized = sanitized.replace(
    /(type=["']password["'][^>]*?)value=["'][^"']*["']/gi,
    '$1value="[REDACTED_PASSWORD]"'
  );

  // General sensitive attribute redaction
  sanitized = sanitized.replace(
    /(password|apiKey|api_key|secret|auth_token|access_token|csrf_token)=(["'])(?:(?!\2).)*\2/gi,
    '$1=$2[REDACTED_SECRET]$2'
  );

  return sanitized;
}

/**
 * Sanitizes an array of target selector strings
 */
export function sanitizeTargetSelectors(targets: unknown): unknown {
  if (!Array.isArray(targets)) return targets;
  return targets.map((item) => {
    if (typeof item === 'string') {
      return item.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
    }
    if (Array.isArray(item)) {
      return item.map((sub) => (typeof sub === 'string' ? sub.replace(EMAIL_REGEX, '[REDACTED_EMAIL]') : sub));
    }
    return item;
  });
}
