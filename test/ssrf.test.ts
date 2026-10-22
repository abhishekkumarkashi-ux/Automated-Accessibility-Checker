import test from 'node:test';
import assert from 'node:assert/strict';
import { validateUrlSyntax, validatePublicDestination, ScanError } from '../server/safety.js';

test('SSRF Protection: Rejects private and loopback IPv4 addresses', async () => {
  const privateUrls = [
    'http://127.0.0.1',
    'http://127.0.0.2:80',
    'http://10.0.0.1',
    'http://10.255.255.255',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://192.168.1.1',
    'http://192.168.0.254',
    'http://0.0.0.0',
    'http://169.254.169.254', // AWS/Azure cloud metadata IP
  ];

  for (const raw of privateUrls) {
    assert.throws(
      () => validateUrlSyntax(raw),
      (err: unknown) => err instanceof ScanError && (err.code === 'BLOCKED_ACCESS' || err.code === 'INVALID_URL'),
      `Expected ${raw} to be blocked by validateUrlSyntax`
    );
  }
});

test('SSRF Protection: Rejects localhost and internal domain names', async () => {
  const internalDomains = [
    'http://localhost',
    'http://localhost:8080',
    'http://app.localhost',
    'http://service.local',
    'http://db.internal',
    'http://test.invalid',
  ];

  for (const raw of internalDomains) {
    assert.throws(
      () => validateUrlSyntax(raw),
      (err: unknown) => err instanceof ScanError && err.code === 'BLOCKED_ACCESS',
      `Expected ${raw} to be blocked as internal domain`
    );
  }
});

test('SSRF Protection: Rejects non-standard web ports to prevent internal service probing', async () => {
  const dangerousPorts = [
    'http://example.com:22',   // SSH
    'http://example.com:25',   // SMTP
    'http://example.com:3306', // MySQL
    'http://example.com:5432', // PostgreSQL
    'http://example.com:6379', // Redis
    'http://example.com:27017',// MongoDB
  ];

  for (const raw of dangerousPorts) {
    assert.throws(
      () => validateUrlSyntax(raw),
      (err: unknown) => err instanceof ScanError && err.code === 'BLOCKED_ACCESS',
      `Expected port on ${raw} to be blocked`
    );
  }
});

test('SSRF Protection: Rejects non-http schemes (file, ftp, gopher)', async () => {
  const dangerousSchemes = [
    'file:///etc/passwd',
    'ftp://public.ftp.server.com',
    'gopher://gopher.floodgap.com',
    'javascript:alert(1)',
  ];

  for (const raw of dangerousSchemes) {
    assert.throws(
      () => validateUrlSyntax(raw),
      (err: unknown) => err instanceof ScanError && err.code === 'INVALID_URL',
      `Expected scheme in ${raw} to be rejected`
    );
  }
});

test('SSRF Protection: Rejects obfuscated numeric and hex IPs', async () => {
  const obfuscated = [
    'http://2130706433',   // 127.0.0.1 in decimal integer
    'http://0x7f000001',   // 127.0.0.1 in hex
  ];

  for (const raw of obfuscated) {
    assert.throws(
      () => validateUrlSyntax(raw),
      (err: unknown) => err instanceof ScanError && err.code === 'BLOCKED_ACCESS',
      `Expected obfuscated IP ${raw} to be blocked`
    );
  }
});

test('SSRF Protection: Allows legitimate public website domains', async () => {
  const valid = [
    'https://example.com',
    'http://example.com',
    'https://youtube.com',
    'https://nasa.gov:443',
    'https://example.com:8443',
  ];

  for (const raw of valid) {
    assert.doesNotThrow(() => validateUrlSyntax(raw));
  }
});
