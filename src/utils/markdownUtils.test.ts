// @vitest-environment happy-dom
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
 * BUG-0695 — KaTeX warned about every typographic dash inside a formula.
 *
 * An assistant answer that writes a range as `$BTC–USDT$` logged
 * `Unrecognized Unicode character "–"` for each one, in strict mode. In math a
 * minus is meant anyway, so the dashes are rewritten inside math spans only —
 * in prose they are correct typography, and code is never touched.
 */

import { describe, expect, it } from "vitest";
import {
  normalizeMathDashes,
  renderSafeMarkdown,
  renderTrustedMarkdown,
} from "./markdownUtils";

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
    const unclosed = "$5\u20136 off";
    expect(normalizeMathDashes(unclosed)).toBe(unclosed);
    // A second `$` does close a span, and the renderer treats that pair as math
    // — so rewriting it is the intended behaviour, not a miss.
    expect(normalizeMathDashes("$5 \u2013 $6 too")).toBe("$5 - $6 too");
  });

  it("leaves an escaped dollar alone", () => {
    // `\$` is plain prose that happens to contain a dollar sign.
    const prices = "Preis \\$100 \u2013 \\$200";
    expect(normalizeMathDashes(prices)).toBe(prices);
    expect(normalizeMathDashes("\\$a\u2013\\$b")).toBe("\\$a\u2013\\$b");
  });
});

describe("renderSafeMarkdown math output", () => {
  it("renders the assistant's own path without the typographic dash", () => {
    const html = renderSafeMarkdown("**Range** $BTC\u2013USDT$");
    // A string on the SSR path, a DocumentFragment in the browser. The rendered
    // text is what matters here — and it also carries KaTeX's own annotation of
    // the source, so this fails if the normalization is missing on this path.
    const text = typeof html === "string" ? html : (html.textContent ?? "");
    expect(text).toContain("BTC");
    expect(text).not.toContain("\u2013");
  });
});

describe("renderTrustedMarkdown math output", () => {
  it("renders a dash range from math, not from typography", () => {
    const html = renderTrustedMarkdown("**Range** $BTC\u2013USDT$");
    expect(html).toContain("katex");
    expect(html).not.toContain("\u2013");
  });
});
