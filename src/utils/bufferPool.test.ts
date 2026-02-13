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

  it("should reuse released buffers (checking underlying ArrayBuffer)", () => {
    const length = 20;
    const buffer1 = pool.acquire(length);
    const bufferRef = buffer1.buffer; // Capture underlying buffer

    pool.release(buffer1);

    const buffer2 = pool.acquire(length);

    // Object identity might differ due to view creation, but underlying buffer must be reused
    expect(buffer2.buffer).toBe(bufferRef);
    expect(buffer2.length).toBe(length);
  });

  it("should create new buffer if pool is empty for that capacity", () => {
    const length = 15; // Capacity 16
    const buffer1 = pool.acquire(length);
    // Not released back

    const buffer2 = pool.acquire(length);
    expect(buffer2.buffer).not.toBe(buffer1.buffer);
    expect(buffer2.length).toBe(length);
  });

  it("should reuse buffer for smaller request if capacity matches", () => {
    const len1 = 12; // Capacity 16
    const len2 = 10; // Capacity 16

    const buffer1 = pool.acquire(len1);
    const bufferRef = buffer1.buffer;
    pool.release(buffer1);

    // Acquire smaller size but fits in same bucket (16)
    const buffer2 = pool.acquire(len2);

    expect(buffer2.buffer).toBe(bufferRef);
    expect(buffer2.length).toBe(len2);
  });

  it("should maintain separate pools for different capacities", () => {
    const len1 = 10; // Cap 16
    const len2 = 20; // Cap 32

    const buffer1 = pool.acquire(len1);
    const buffer2 = pool.acquire(len2);

    pool.release(buffer1);
    pool.release(buffer2);

    // Acquire len2, should get buffer2's backing buffer
    const newBuffer2 = pool.acquire(len2);
    expect(newBuffer2.buffer).toBe(buffer2.buffer);
    expect(newBuffer2.length).toBe(len2);

    // Acquire len1, should get buffer1's backing buffer
    const newBuffer1 = pool.acquire(len1);
    expect(newBuffer1.buffer).toBe(buffer1.buffer);
    expect(newBuffer1.length).toBe(len1);
  });

  it("should clear all buffers from the pool", () => {
    const length = 10;
    const buffer = pool.acquire(length);
    const bufferRef = buffer.buffer;
    pool.release(buffer);

    pool.clear();

    const newBuffer = pool.acquire(length);
    expect(newBuffer.buffer).not.toBe(bufferRef);
  });

  it("should handle zero length buffers correctly", () => {
    const buffer = pool.acquire(0);
    expect(buffer.length).toBe(0);

    pool.release(buffer);
    const recycled = pool.acquire(0);
    expect(recycled.length).toBe(0);
  });
});
