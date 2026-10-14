import { Injectable } from '@nestjs/common';

export const PAIR_LIMIT = 20;
export const PAIR_WINDOW_MS = 60_000;

/** Sliding window per client IP, in memory: per replica by design (see AGENTS.md). */
@Injectable()
export class PairRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Records an attempt; false when the IP is over the limit. */
  allow(ip: string, now = Date.now()): boolean {
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < PAIR_WINDOW_MS);
    if (recent.length >= PAIR_LIMIT) {
      this.hits.set(ip, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(ip, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [ip, ts] of this.hits) {
      if (ts.every((t) => now - t >= PAIR_WINDOW_MS)) this.hits.delete(ip);
    }
  }
}
