import { Injectable } from '@nestjs/common';

export const LOGIN_LIMIT = 10;
export const LOGIN_WINDOW_MS = 60_000;

/** Sliding window per client IP, in memory: per replica by design (see AGENTS.md). */
@Injectable()
export class LoginRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Records an attempt; false when the IP is over the limit. */
  allow(ip: string, now = Date.now()): boolean {
    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
    if (recent.length >= LOGIN_LIMIT) {
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
      if (ts.every((t) => now - t >= LOGIN_WINDOW_MS)) this.hits.delete(ip);
    }
  }
}
