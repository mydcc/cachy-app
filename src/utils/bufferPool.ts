/*
 * Copyright (C) 2026 MYDCT
 *
 * Buffer Pool for recycling Float64Arrays to reduce garbage collection.
 */

export class BufferPool {
  private buffers: Float64Array[] = [];
  private index = 0;

  /**
   * Returns a Float64Array of at least the specified size.
   * Returns a subarray view ensuring the length matches exactly the requested size.
   * The array content is NOT cleared (may contain dirty data).
   */
  get(size: number): Float64Array {
    if (this.index >= this.buffers.length) {
      this.buffers.push(new Float64Array(size));
    }

    let buf = this.buffers[this.index];

    // Grow buffer if too small
    if (buf.length < size) {
      buf = new Float64Array(size);
      this.buffers[this.index] = buf;
    }

    this.index++;

    // Return a view of the exact size requested
    if (buf.length === size) {
      return buf;
    } else {
      return buf.subarray(0, size);
    }
  }

  /**
   * Resets the pool index, allowing buffers to be reused.
   * Call this at the start of a calculation cycle.
   */
  reset() {
    this.index = 0;
  }
}
