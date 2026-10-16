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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * BUG-0693 — KaTeX warned about every typographic dash inside a formula.
 *
 * An assistant answer that writes a range as `$BTC–USDT$` logged
 * `Unrecognized Unicode character "–"` for each one, in strict mode. In math a
 * minus is meant anyway, so the dashes are rewritten inside math spans only —
 * in prose they are correct typography, and code is never touched.
 */

import { describe, expect, it } from "vitest";
import { normalizeMathDashes, renderTrustedMarkdown } from "./markdownUtils";

describe("normalizeMathDashes", () => {
  it("rewrites typographic dashes inside inline and display math", () => {
    expect(normalizeMathDashes("$BTC\u2013USDT$")).toBe("$BTC-USDT$");
    expect(normalizeMathDashes("$$a \u2014 b$$")).toBe("$$a - b$$");
    expect(normalizeMathDashes("$x \u2212 y$")).toBe("$x - y$");
    expect(normalizeMathDashes("$a\u2012b$")).toBe("$a-b$");
    expect(normalizeMathDashes("$a\u2015b$")).toBe("$a-b$");
  });

  it("leaves a dash in prose alone", () => {
    const prose = "Range BTC\u2013USDT, handelsüblich";
    expect(normalizeMathDashes(prose)).toBe(prose);
  });

  it("leaves code alone", () => {
    const fenced = "```js\nconst range = '$a\u2013b$';\n```";
    expect(normalizeMathDashes(fenced)).toBe(fenced);
    const inline = "`$a\u2013b$`";
    expect(normalizeMathDashes(inline)).toBe(inline);
  });

  it("normalizes every math span on a line", () => {
    expect(normalizeMathDashes("$a\u2013b$ and $c\u2013d$")).toBe(
      "$a-b$ and $c-d$",
    );
  });

  it("needs a closing delimiter before it rewrites anything", () => {
    const prices = "$5 off $6 too";
    expect(normalizeMathDashes(prices)).toBe(prices);
  });
});

describe("renderTrustedMarkdown math output", () => {
  it("renders a dash range from math, not from typography", () => {
    const html = renderTrustedMarkdown("**Range** $BTC\u2013USDT$");
    expect(html).toContain("katex");
    expect(html).not.toContain("\u2013");
  });
});
