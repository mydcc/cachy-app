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
 * Reduces garbage collection overhead by recycling arrays using power-of-two bucketing.
 */

export class BufferPool {
  private pool: Map<number, Float64Array[]> = new Map();

  /**
   * Calculate the next power of two for the given number.
   * Efficient bitwise implementation for 32-bit integers.
   */
  private nextPowerOfTwo(n: number): number {
    if (n === 0) return 0;
    // Handle edge case where n is already a power of 2
    n--;
    n |= n >> 1;
    n |= n >> 2;
    n |= n >> 4;
    n |= n >> 8;
    n |= n >> 16;
    n++;
    return n;
  }

  /**
   * Acquire a Float64Array of the specified length.
   * Returns a recycled array if available, or creates a new one.
   * The returned array uses the smallest power-of-two buffer that fits.
   * The returned array may contain dirty data.
   */
  acquire(length: number): Float64Array {
    if (length === 0) return new Float64Array(0);

    const capacity = this.nextPowerOfTwo(length);
    let list = this.pool.get(capacity);
    let buffer: Float64Array;

    if (list && list.length > 0) {
      buffer = list.pop()!;
    } else {
      buffer = new Float64Array(capacity);
    }

    // Return a view of the requested length.
    // If exact match, return the buffer directly (optimization).
    if (buffer.length === length) {
      return buffer;
    }

    // Create a view. This is cheap (no data copy).
    return buffer.subarray(0, length);
  }

  /**
   * Release a Float64Array back to the pool for reuse.
   * It identifies the original allocated size from the underlying buffer.
   */
  release(buffer: Float64Array) {
    if (buffer.length === 0) return;

    // Determine the capacity of the underlying buffer
    // Float64Array element size is 8 bytes.
    const capacity = buffer.buffer.byteLength / 8;

    // Safety check: ensure we are releasing the full buffer or a clean view starting at 0
    if (buffer.byteOffset !== 0) {
       // If offset is non-zero, we can't easily reuse it as a generic buffer.
       // However, since our acquire() always returns subarray(0, ...), offset should be 0.
       // If the user sliced it themselves and released the slice, we might lose the original buffer reference
       // unless we recover it from .buffer.
    }

    // We store a full view of the underlying buffer in the pool
    // to allow subsequent acquisitions to slice it differently.
    // Recreating the Float64Array view is cheap.
    const fullBuffer = new Float64Array(buffer.buffer);

    let list = this.pool.get(capacity);
    if (!list) {
      list = [];
      this.pool.set(capacity, list);
    }
    list.push(fullBuffer);
  }

  /**
   * Clear all buffers from the pool.
   */
  clear() {
    this.pool.clear();
  }
}
