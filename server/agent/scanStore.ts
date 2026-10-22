import crypto from 'node:crypto';
import type { ScanResponse } from '../types.js';

interface StoredScan {
  scan: ScanResponse;
  expiresAt: number;
}

// 30 minutes TTL in memory
const SCAN_TTL_MS = 30 * 60 * 1000;

class ScanStore {
  private scans = new Map<string, StoredScan>();

  /**
   * Stores a scan in memory with a short expiry time.
   * Returns a unique, validated scan ID.
   */
  public store(scan: ScanResponse): string {
    this.evictExpired();
    const scanId = crypto.randomUUID();
    this.scans.set(scanId, {
      scan: { ...scan, scanId },
      expiresAt: Date.now() + SCAN_TTL_MS,
    });
    return scanId;
  }

  /**
   * Retrieves a scan by its validated ID, or undefined if missing/expired.
   */
  public get(scanId: string): ScanResponse | undefined {
    if (!scanId || typeof scanId !== 'string') return undefined;
    const item = this.scans.get(scanId);
    if (!item) return undefined;
    if (Date.now() > item.expiresAt) {
      this.scans.delete(scanId);
      return undefined;
    }
    return item.scan;
  }

  /**
   * Evicts expired scans from memory.
   */
  private evictExpired(): void {
    const now = Date.now();
    for (const [id, item] of this.scans.entries()) {
      if (now > item.expiresAt) {
        this.scans.delete(id);
      }
    }
  }

  /**
   * Clear all stored scans (useful for testing).
   */
  public clear(): void {
    this.scans.clear();
  }
}

export const scanStore = new ScanStore();
