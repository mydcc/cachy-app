/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Token-bucket rate limiter, extracted from apiService.ts (FEAT-0342).
 * Leaf module with no imports.
 */

// --- Rate Limiter (Token Bucket) ---
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRateMs: number;
  private queue: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(tokensPerSecond: number, capacity?: number) {
    this.capacity = capacity ?? tokensPerSecond;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    this.refillRateMs = tokensPerSecond / 1000;
  }

  async waitForToken(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleRefill();
    });
  }

  private scheduleRefill() {
    if (this.timer) return;
    if (this.queue.length === 0) return;

    const needed = 1 - this.tokens;
    let waitTime = needed / this.refillRateMs;
    if (waitTime < 0) waitTime = 0;

    this.timer = setTimeout(() => {
      this.timer = null;
      this.processQueue();
    }, waitTime);
  }

  private processQueue() {
    this.refill();

    while (this.tokens >= 1 && this.queue.length > 0) {
      this.tokens -= 1;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }

    if (this.queue.length > 0) {
      this.scheduleRefill();
    }
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      const newTokens = elapsed * this.refillRateMs;
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
}
