import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtmlSnippet, sanitizeTargetSelectors } from '../server/sanitizer.js';

test('Data Sanitizer: Redacts passwords and sensitive form values', () => {
  const htmlWithPassword = '<input type="password" name="user_password" value="SuperSecret123!" id="pwd">';
  const sanitized = sanitizeHtmlSnippet(htmlWithPassword);

  assert.ok(!sanitized.includes('SuperSecret123!'), 'Password value must be redacted');
  assert.ok(sanitized.includes('[REDACTED_'), 'Redacted placeholder must be present');
});

test('Data Sanitizer: Redacts email addresses in HTML snippets', () => {
  const htmlWithEmail = '<p>Contact us at privacy.officer@company-internal.org for questions.</p>';
  const sanitized = sanitizeHtmlSnippet(htmlWithEmail);

  assert.ok(!sanitized.includes('privacy.officer@company-internal.org'));
  assert.ok(sanitized.includes('[REDACTED_EMAIL]'));
});

test('Data Sanitizer: Redacts JWT and Bearer tokens', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const htmlWithToken = `<div data-token="${jwt}">Profile Card</div>`;
  const sanitized = sanitizeHtmlSnippet(htmlWithToken);

  assert.ok(!sanitized.includes(jwt), 'JWT token must be redacted');
  assert.ok(sanitized.includes('[REDACTED_JWT_TOKEN]'));
});

test('Data Sanitizer: Redacts credit card patterns', () => {
  const htmlWithCard = '<span>Your card 4532 1234 5678 9010 was billed.</span>';
  const sanitized = sanitizeHtmlSnippet(htmlWithCard);

  assert.ok(!sanitized.includes('4532 1234 5678 9010'));
  assert.ok(sanitized.includes('[REDACTED_CARD_NUMBER]'));
});

test('Data Sanitizer: Sanitizes selector targets', () => {
  const target = ['div#user-email-test@example.com > input'];
  const sanitized = sanitizeTargetSelectors(target) as string[];

  assert.strictEqual(sanitized[0], 'div#[REDACTED_EMAIL] > input');
});
