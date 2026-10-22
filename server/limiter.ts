import type { Request, Response, NextFunction } from 'express';
import { ScanError } from './safety.js';

interface QueuedItem {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class ScanLimiter {
  private activeScans = 0;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly queue: QueuedItem[] = [];

  // Per-IP rate limiting: Map<IP, Array of timestamps in ms>
  private readonly ipRequests = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequestsPerWindow: number;

  constructor(
    maxConcurrent = Number(process.env.MAX_CONCURRENT_SCANS ?? 2),
    maxQueue = Number(process.env.MAX_QUEUE_SIZE ?? 6),
    windowMs = 5 * 60 * 1000,
    maxRequestsPerWindow = 20
  ) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
    this.windowMs = windowMs;
    this.maxRequestsPerWindow = maxRequestsPerWindow;

    // Periodically clean stale IP tracking
    setInterval(() => this.cleanupIpTracking(), 2 * 60 * 1000).unref();
  }

  public getStats() {
    return {
      activeScans: this.activeScans,
      queuedScans: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
    };
  }

  /**
   * Middleware to check and record IP rate limits
   */
  public rateLimitMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown-client';
      const now = Date.now();
      const cutoff = now - this.windowMs;

      let timestamps = this.ipRequests.get(ip) || [];
      timestamps = timestamps.filter((t) => t > cutoff);

      if (timestamps.length >= this.maxRequestsPerWindow) {
        res.status(429).json({
          error: `Too many scan requests from your IP. Limit is ${this.maxRequestsPerWindow} scans per 5 minutes.`,
          code: 'RATE_LIMITED',
          suggestion: 'Please wait a few moments before launching another automated scan.',
          retryAfterSeconds: 30,
        });
        return;
      }

      timestamps.push(now);
      this.ipRequests.set(ip, timestamps);
      next();
    };
  }

  /**
   * Acquires a concurrency slot or queues the request up to maxQueue
   */
  public async acquire(): Promise<() => void> {
    if (this.activeScans < this.maxConcurrent) {
      this.activeScans++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }

    if (this.queue.length >= this.maxQueue) {
      throw new ScanError(
        'The scanner is currently processing multiple websites at maximum capacity. Please wait a moment and try again.',
        429,
        'SERVER_BUSY',
        'Wait 15–30 seconds for ongoing audits to finish, then click Try Again.'
      );
    }

    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((item) => item.resolve === onSlotAcquired);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(
          new ScanError(
            'Timed out waiting for an available scan worker.',
            504,
            'TIMEOUT',
            'The scan worker pool is currently busy. Try again shortly.'
          )
        );
      }, 25_000);

      const onSlotAcquired = () => {
        clearTimeout(timer);
        this.activeScans++;
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.release();
          }
        });
      };

      this.queue.push({
        resolve: onSlotAcquired,
        reject,
        timer,
      });
    });
  }

  private release() {
    this.activeScans = Math.max(0, this.activeScans - 1);
    const nextInQueue = this.queue.shift();
    if (nextInQueue) {
      nextInQueue.resolve();
    }
  }

  private cleanupIpTracking() {
    const cutoff = Date.now() - this.windowMs;
    for (const [ip, list] of this.ipRequests.entries()) {
      const active = list.filter((t) => t > cutoff);
      if (active.length === 0) {
        this.ipRequests.delete(ip);
      } else {
        this.ipRequests.set(ip, active);
      }
    }
  }
}

export const scanLimiter = new ScanLimiter();
