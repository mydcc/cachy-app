/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { serializeJsonLd } from "./jsonLd";

describe("serializeJsonLd (BUG-0727)", () => {
  it("escapes a closing script tag inside a string", () => {
    const serialized = serializeJsonLd({
      name: "</script><script>alert(1)</script>",
    });

    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain(">");
    expect(JSON.parse(serialized).name).toBe(
      "</script><script>alert(1)</script>",
    );
  });

  it("escapes ampersands and Unicode line separators", () => {
    const serialized = serializeJsonLd({ text: "a&b\u2028c\u2029d" });

    expect(serialized).not.toContain("&");
    expect(serialized).not.toContain("\u2028");
    expect(serialized).not.toContain("\u2029");
    expect(JSON.parse(serialized).text).toBe("a&b\u2028c\u2029d");
  });
});
