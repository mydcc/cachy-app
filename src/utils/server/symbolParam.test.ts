/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { sanitizeSymbol, sanitizeSymbolList } from "./symbolParam";

describe("sanitizeSymbol", () => {
  it("keeps the venue symbol alphabet", () => {
    expect(sanitizeSymbol("BTCUSDT")).toBe("BTCUSDT");
  });

  it("uppercases so one symbol has one cache entry", () => {
    expect(sanitizeSymbol("btcusdt")).toBe("BTCUSDT");
    expect(sanitizeSymbol("BtCuSdT")).toBe("BTCUSDT");
  });

  it("strips query, path and fragment separators", () => {
    expect(sanitizeSymbol("BTCUSDT&limit=1000")).toBe("BTCUSDTLIMIT1000");
    expect(sanitizeSymbol("../../etc/passwd")).toBe("ETCPASSWD");
    expect(sanitizeSymbol("BTC#frag")).toBe("BTCFRAG");
  });
});

describe("sanitizeSymbolList", () => {
  it("keeps one valid symbol per comma-separated member", () => {
    expect(sanitizeSymbolList("BTCUSDT,ETHUSDT")).toBe("BTCUSDT,ETHUSDT");
  });

  it("drops empty members", () => {
    expect(sanitizeSymbolList("BTCUSDT,,ETHUSDT,")).toBe("BTCUSDT,ETHUSDT");
  });

  it("returns an empty string when nothing valid remains", () => {
    expect(sanitizeSymbolList("&&,,")).toBe("");
  });
});
