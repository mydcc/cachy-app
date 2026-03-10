/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * A utility class to handle promise deduplication.
 * Useful for ensuring only a single in-flight request exists for a given key,
 * preventing duplicate API calls or redundant heavy computations.
 */
export class RequestDeduplicator<T = unknown> {
  private pending = new Map<string, Promise<T>>();

  /**
   * Executes the provided task if no request for the given key is currently in-flight.
   * If a request is already in-flight, it returns the existing promise.
   *
   * @param key Unique identifier for the task.
   * @param task Function that returns a Promise to be deduplicated.
   * @param onJoin Optional callback fired when a duplicate request joins an existing in-flight promise.
   * @returns The result of the task.
   */
  async execute(
    key: string,
    task: () => Promise<T>,
    onJoin?: (key: string) => void
  ): Promise<T> {
    if (this.pending.has(key)) {
      if (onJoin) onJoin(key);
      return this.pending.get(key) as Promise<T>;
    }

    const promise = task().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Checks if a request with the given key is currently in-flight.
   */
  has(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * Clears all pending requests. (Note: this does not cancel the promises, just removes them from the map).
   */
  clear(): void {
    this.pending.clear();
  }

  /**
   * Deletes a specific pending request from the map.
   */
  delete(key: string): boolean {
    return this.pending.delete(key);
  }
}
