/*
 * Copyright (C) 2026 MYDCT
 *
 * Buffer Pool for TypedArray reuse.
 * Reduces garbage collection overhead by recycling arrays.
 */

export class BufferPool {
  private pool: Map<number, Float64Array[]> = new Map();

  /**
   * Acquire a Float64Array of the specified length.
   * Returns a recycled array if available, or creates a new one.
   * The returned array may contain dirty data.
   */
  acquire(length: number): Float64Array {
    const list = this.pool.get(length);
    if (list && list.length > 0) {
      return list.pop()!;
    }
    return new Float64Array(length);
  }

  /**
   * Release a Float64Array back to the pool for reuse.
   */
  release(buffer: Float64Array) {
    const len = buffer.length;
    let list = this.pool.get(len);
    if (!list) {
      list = [];
      this.pool.set(len, list);
    }
    list.push(buffer);
  }

  /**
   * Clear all buffers from the pool.
   */
  clear() {
    this.pool.clear();
  }
}
