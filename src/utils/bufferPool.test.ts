import { describe, it, expect, beforeEach } from "vitest";
import { BufferPool } from "./bufferPool";

describe("BufferPool", () => {
  let pool: BufferPool;

  beforeEach(() => {
    pool = new BufferPool();
  });

  it("should acquire a Float64Array of the specified length", () => {
    const length = 10;
    const buffer = pool.acquire(length);
    expect(buffer).toBeInstanceOf(Float64Array);
    expect(buffer.length).toBe(length);
  });

  it("should reuse released buffers of the same length", () => {
    const length = 20;
    const buffer1 = pool.acquire(length);
    pool.release(buffer1);

    const buffer2 = pool.acquire(length);
    expect(buffer2).toBe(buffer1); // Same object reference
  });

  it("should create new buffer if pool is empty for that length", () => {
    const length = 15;
    const buffer1 = pool.acquire(length);
    // Not released back

    const buffer2 = pool.acquire(length);
    expect(buffer2).not.toBe(buffer1);
    expect(buffer2.length).toBe(length);
  });

  it("should maintain separate pools for different lengths", () => {
    const len1 = 10;
    const len2 = 20;

    const buffer1 = pool.acquire(len1);
    const buffer2 = pool.acquire(len2);

    pool.release(buffer1);
    pool.release(buffer2);

    // Acquire len2, should get buffer2 back
    const newBuffer2 = pool.acquire(len2);
    expect(newBuffer2).toBe(buffer2);
    expect(newBuffer2.length).toBe(len2);

    // Acquire len1, should get buffer1 back
    const newBuffer1 = pool.acquire(len1);
    expect(newBuffer1).toBe(buffer1);
    expect(newBuffer1.length).toBe(len1);
  });

  it("should handle multiple buffers of the same length", () => {
    const length = 10;
    const buffer1 = pool.acquire(length);
    const buffer2 = pool.acquire(length);

    pool.release(buffer1);
    pool.release(buffer2);

    // LIFO behavior is typical for simple array stacks, checking if we get one of them back
    const recycled1 = pool.acquire(length);
    const recycled2 = pool.acquire(length);

    expect([buffer1, buffer2]).toContain(recycled1);
    expect([buffer1, buffer2]).toContain(recycled2);
    expect(recycled1).not.toBe(recycled2);
  });

  it("should clear all buffers from the pool", () => {
    const length = 10;
    const buffer = pool.acquire(length);
    pool.release(buffer);

    pool.clear();

    const newBuffer = pool.acquire(length);
    expect(newBuffer).not.toBe(buffer);
  });

  it("should handle zero length buffers correctly", () => {
    const buffer = pool.acquire(0);
    expect(buffer.length).toBe(0);

    pool.release(buffer);
    const recycled = pool.acquire(0);
    expect(recycled).toBe(buffer);
  });
});
