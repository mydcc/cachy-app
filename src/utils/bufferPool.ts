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
 * Buffer Pool for TypedArray reuse.
 * Reduces garbage collection overhead by recycling arrays.
 * Implements a "Bucketing" strategy (Power of 2) to ensure buffers of similar sizes can be reused.
 */

export class BufferPool {
  private pool: Map<number, Float64Array[]> = new Map();

  /**
   * Calculates the bucket capacity (next power of 2) for a requested size.
   * Enforces a minimum capacity of 256 to avoid micro-allocations.
   */
  private getCapacity(minCapacity: number): number {
    if (minCapacity <= 0) return 0;
    const minSize = 256;
    if (minCapacity <= minSize) return minSize;
    return Math.pow(2, Math.ceil(Math.log2(minCapacity)));
  }

  /**
   * Acquire a Float64Array with at least the specified capacity.
   * Returns a recycled array from the appropriate bucket if available, or creates a new one.
   * The returned array may contain dirty data.
   */
  acquire(minCapacity: number): Float64Array {
    const capacity = this.getCapacity(minCapacity);
    const list = this.pool.get(capacity);
    if (list && list.length > 0) {
      return list.pop()!;
    }
    return new Float64Array(capacity);
  }

  /**
   * Release a Float64Array back to the pool for reuse.
   */
  release(buffer: Float64Array) {
    const capacity = buffer.length;
    let list = this.pool.get(capacity);
    if (!list) {
      list = [];
      this.pool.set(capacity, list);
    }
    // Limit pool size per bucket to prevent unbounded memory usage if access patterns change
    if (list.length < 50) {
        list.push(buffer);
    }
  }

  /**
   * Clear all buffers from the pool.
   */
  clear() {
    this.pool.clear();
  }
}
