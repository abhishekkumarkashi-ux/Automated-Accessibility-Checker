import dns from 'node:dns/promises';
import net from 'node:net';

export class ScanError extends Error {
  readonly status: number;
  readonly code: string;
  readonly suggestion?: string;

  constructor(message: string, status = 400, code = 'SCAN_FAILED', suggestion?: string) {
    super(message);
    this.name = 'ScanError';
    this.status = status;
    this.code = code;
    this.suggestion = suggestion;
  }
}

const ipv4ToNumber = (address: string): number =>
  address.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);

const inV4Range = (address: string, network: string, prefix: number): boolean => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network) & mask);
};

function isPublicIp(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    const denied: Array<[string, number]> = [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
      ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
    ];
    return !denied.some(([network, prefix]) => inV4Range(address, network, prefix));
  }

  if (version === 6) {
    const normalized = address.toLowerCase().split('%')[0];
    if (normalized === '::' || normalized === '::1') return false;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) return isPublicIp(mapped);
      return false;
    }
    // Only global unicast (2000::/3) is eligible; exclude documentation and
    // the transition/translation ranges that can encode another IPv4 address.
    if (!/^[23][0-9a-f]{3}:/i.test(normalized)) return false;
    if (/^2001:(?:0?db8|0{0,3}2):/i.test(normalized)) return false;
    if (/^2002:/i.test(normalized) || /^64:ff9b:/i.test(normalized)) return false;
    return true;
  }
  return false;
}

/**
 * Normalizes user input into a standard URL string with protocol.
 * Automatically adds 'https://' if protocol is missing (e.g. 'youtube.com' -> 'https://youtube.com').
 */
export function normalizeInputUrl(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ScanError('Enter a website URL up to 2,048 characters long.', 400, 'INVALID_URL');
  }

  let trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) {
    throw new ScanError('Enter a website URL up to 2,048 characters long.', 400, 'INVALID_URL');
  }

  // Remove potential leading/trailing quotes or backticks from copy-pasting
  trimmed = trimmed.replace(/^["'`]|["'`]$/g, '').trim();

  // If no scheme present (e.g. 'youtube.com' or '//youtube.com')
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    if (trimmed.startsWith('//')) {
      trimmed = 'https:' + trimmed;
    } else {
      trimmed = 'https://' + trimmed;
    }
  }

  return trimmed;
}

export function validateUrlSyntax(raw: unknown): URL {
  const normalized = normalizeInputUrl(raw);

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new ScanError(
      'That does not look like a valid website URL.',
      400,
      'INVALID_URL',
      'Please include a public domain name, such as "youtube.com" or "https://example.com".'
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScanError(
      `Only public HTTP and HTTPS websites can be scanned. (${url.protocol} is not supported)`,
      400,
      'INVALID_URL',
      'Enter an address starting with http:// or https://'
    );
  }

  if (url.username || url.password) {
    throw new ScanError(
      'URLs with embedded credentials (usernames or passwords) are not allowed.',
      400,
      'INVALID_URL'
    );
  }

  if (url.hostname.endsWith('.') || url.hostname === '') {
    url.hostname = url.hostname.replace(/\.+$/, '');
  }

  const hostname = url.hostname.toLowerCase();

  // Disallow local, test, or internal names
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid') ||
    hostname.endsWith('.home.arpa') ||
    hostname.endsWith('.onion')
  ) {
    throw new ScanError(
      `"${hostname}" is a local or reserved address and cannot be scanned.`,
      400,
      'BLOCKED_ACCESS',
      'Only public internet websites can be audited by AccessScan.'
    );
  }

  // Restrict to standard web ports to prevent internal service probing (e.g. redis, postgres, ssh)
  if (url.port) {
    const portNum = Number(url.port);
    const allowedPorts = [80, 443, 8080, 8443];
    if (!allowedPorts.includes(portNum)) {
      throw new ScanError(
        `Port ${portNum} is restricted. Only standard web ports (80, 443, 8080, 8443) can be scanned.`,
        400,
        'BLOCKED_ACCESS',
        'Scans are restricted to standard web ports to prevent internal infrastructure probing.'
      );
    }
  }

  // Detect and reject obfuscated numeric (decimal, hex, octal) IP formats
  if (/^\d+$/.test(hostname)) {
    // Dword decimal integer IP (e.g., 2130706433 for 127.0.0.1)
    const num = Number(hostname);
    if (!Number.isNaN(num) && num >= 0 && num <= 0xffffffff) {
      const ip = `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;
      if (!isPublicIp(ip)) {
        throw new ScanError(
          `Numeric IP address (${hostname} -> ${ip}) resolves to private network space.`,
          400,
          'BLOCKED_ACCESS'
        );
      }
    }
  }

  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    // Hex integer IP
    const num = parseInt(hostname, 16);
    if (!Number.isNaN(num) && num >= 0 && num <= 0xffffffff) {
      const ip = `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;
      if (!isPublicIp(ip)) {
        throw new ScanError(
          `Hex IP address (${hostname} -> ${ip}) resolves to private network space.`,
          400,
          'BLOCKED_ACCESS'
        );
      }
    }
  }

  if (net.isIP(hostname) && !isPublicIp(hostname)) {
    throw new ScanError(
      `"${hostname}" is a private or reserved IP address and cannot be scanned.`,
      400,
      'BLOCKED_ACCESS',
      'Scanning private network infrastructure is disallowed.'
    );
  }

  return url;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, hostname: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new ScanError(
            `DNS resolution for "${hostname}" timed out.`,
            504,
            'TIMEOUT',
            'The website host took longer than 15 seconds to resolve. Check your connection or verify the URL.'
          )
        ),
      milliseconds
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

// In-memory cache for validated public hostnames (short 60s TTL mitigates DNS rebinding risks)
const dnsCache = new Map<string, { expiresAt: number }>();
const DNS_CACHE_TTL_MS = 60 * 1000;

export async function validatePublicDestination(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const literalVersion = net.isIP(hostname);
  if (literalVersion) {
    if (!isPublicIp(hostname)) {
      throw new ScanError(
        `Private or reserved IP address (${hostname}) cannot be scanned.`,
        400,
        'BLOCKED_ACCESS'
      );
    }
    return;
  }

  const now = Date.now();
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    // 15-second timeout for DNS lookup prevents false positives on cold DNS lookups
    addresses = await withTimeout(dns.lookup(hostname, { all: true }), 15_000, hostname);
  } catch (error) {
    if (error instanceof ScanError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    const isNotFound = /ENOTFOUND|EAI_NONAME|EAI_AGAIN/i.test(msg);
    throw new ScanError(
      isNotFound
        ? `Could not find website host "${hostname}". Please check that the URL is spelled correctly.`
        : `Could not resolve domain "${hostname}": ${msg}`,
      400,
      'DNS_FAILED',
      'Verify the website name is spelled correctly and is currently accessible on the public web.'
    );
  }

  if (!addresses || addresses.length === 0) {
    throw new ScanError(
      `The website host "${hostname}" does not have any public IP addresses.`,
      400,
      'DNS_FAILED',
      'Check if the domain has active DNS A or AAAA records.'
    );
  }

  if (addresses.some(({ address }) => !isPublicIp(address))) {
    throw new ScanError(
      `This website resolves to a private or reserved network address and cannot be scanned.`,
      400,
      'BLOCKED_ACCESS',
      'Security restrictions prevent scanning internal or loopback IP ranges.'
    );
  }

  // Only cache SUCCESSFUL validations! Never cache transient DNS errors.
  dnsCache.set(hostname, { expiresAt: now + DNS_CACHE_TTL_MS });
}

export function getPublicSuffixHost(url: URL): string {
  return url.hostname.toLowerCase();
}

