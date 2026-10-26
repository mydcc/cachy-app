/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_WS_FRAME_BYTES,
  frameByteLength,
  isOversizedFrame,
} from "./wsFrameGuard";

describe("isOversizedFrame", () => {
  it("accepts a normal text frame", () => {
    expect(isOversizedFrame('{"ch":"ticker","data":{}}')).toBe(false);
  });

  it("rejects a text frame above the cap", () => {
    expect(isOversizedFrame("x".repeat(MAX_WS_FRAME_BYTES + 1))).toBe(true);
  });

  it("accepts a frame exactly at the cap", () => {
    expect(isOversizedFrame("x".repeat(MAX_WS_FRAME_BYTES))).toBe(false);
  });

  it("measures typed arrays and ArrayBuffers in bytes", () => {
    expect(frameByteLength(new Uint8Array(10))).toBe(10);
    expect(frameByteLength(new ArrayBuffer(10))).toBe(10);
    expect(isOversizedFrame(new Uint8Array(MAX_WS_FRAME_BYTES + 1))).toBe(true);
  });

  it("measures Blobs by size", () => {
    expect(frameByteLength(new Blob(["abcd"]))).toBe(4);
    expect(isOversizedFrame(new Blob(["x".repeat(MAX_WS_FRAME_BYTES + 1)]))).toBe(
      true,
    );
  });

  it("treats a value with no measurable size as empty, not as oversized", () => {
    expect(frameByteLength(null)).toBe(0);
    expect(isOversizedFrame({})).toBe(false);
  });
});
