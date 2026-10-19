import dns from 'node:dns/promises';
import net from 'node:net';

export class ScanError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ScanError';
    this.status = status;
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

export function validateUrlSyntax(raw: unknown): URL {
  if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > 2048) {
    throw new ScanError('Enter a website URL up to 2,048 characters long.');
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ScanError('That does not look like a valid URL. Include a public website, such as https://example.com.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScanError('Only public HTTP and HTTPS websites can be scanned.');
  }
  if (url.username || url.password) {
    throw new ScanError('URLs with embedded usernames or passwords are not allowed.');
  }
  if (url.hostname.endsWith('.') || url.hostname === '') {
    url.hostname = url.hostname.replace(/\.+$/, '');
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
    hostname.endsWith('.internal') || hostname.endsWith('.test') || hostname.endsWith('.invalid') ||
    hostname.endsWith('.home.arpa') || hostname.endsWith('.onion')
  ) {
    throw new ScanError('Local and reserved hostnames cannot be scanned. Use a public website.');
  }
  if (net.isIP(hostname) && !isPublicIp(hostname)) {
    throw new ScanError('Private or reserved IP addresses cannot be scanned.');
  }
  return url;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ScanError('The website host took too long to resolve.', 504)), milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

const dnsCache = new Map<string, { expiresAt: number; error?: ScanError }>();
const DNS_CACHE_TTL_MS = 5 * 60 * 1000;

export async function validatePublicDestination(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const literalVersion = net.isIP(hostname);
  if (literalVersion) {
    if (!isPublicIp(hostname)) throw new ScanError('Private or reserved IP addresses cannot be scanned.');
    return;
  }

  const now = Date.now();
  const cached = dnsCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    if (cached.error) throw cached.error;
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await withTimeout(dns.lookup(hostname, { all: true, verbatim: true }), 5000);
  } catch (error) {
    const err = error instanceof ScanError ? error : new ScanError('The website host could not be resolved. Check the URL and try again.', 400);
    dnsCache.set(hostname, { expiresAt: now + DNS_CACHE_TTL_MS, error: err });
    throw err;
  }
  if (addresses.length === 0) {
    const err = new ScanError('The website host does not have a public address.');
    dnsCache.set(hostname, { expiresAt: now + DNS_CACHE_TTL_MS, error: err });
    throw err;
  }
  if (addresses.some(({ address }) => !isPublicIp(address))) {
    const err = new ScanError('This website resolves to a private or reserved network address and cannot be scanned.');
    dnsCache.set(hostname, { expiresAt: now + DNS_CACHE_TTL_MS, error: err });
    throw err;
  }

  dnsCache.set(hostname, { expiresAt: now + DNS_CACHE_TTL_MS });
}

export function getPublicSuffixHost(url: URL): string {
  return url.hostname.toLowerCase();
}
