/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { toastIcon } from "./toastIcons";

describe("toastIcon allowlist (BUG-0727)", () => {
  it("returns the icon for a valid type", () => {
    expect(toastIcon("success")).toContain("polyline");
    expect(toastIcon("error")).toContain("line");
  });

  it("falls back to the info icon for inherited or arbitrary strings", () => {
    const info = toastIcon("info");
    expect(toastIcon("constructor")).toBe(info);
    expect(toastIcon("__proto__")).toBe(info);
    expect(toastIcon("toString")).toBe(info);
  });

  it("is the lookup the component actually uses", () => {
    const source = readFileSync(
      new URL("./ToastItem.svelte", import.meta.url),
      "utf8",
    );
    expect(source).toContain("toastIcon(toast.type)");
    expect(source).not.toContain("icons[toast.type]");
  });

  it("falls back for non-string input", () => {
    const info = toastIcon("info");
    expect(toastIcon(undefined)).toBe(info);
    expect(toastIcon(null)).toBe(info);
    expect(toastIcon({ type: "error" })).toBe(info);
  });
});
