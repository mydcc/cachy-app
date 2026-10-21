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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0609 — control geometry has one source.
 *
 * The point of the token layer is that a later density mode changes a value,
 * not a rule. A stylesheet assertion alone would not catch a control that still
 * renders its old literal, so the height assertions read the *computed* style
 * and compare it to the token the document actually declares.
 *
 * Values are the shipped ones (42 / 34 / 70 px), which is also the proof that
 * this change is a visual no-op.
 */

// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

const CSS = readFileSync("src/themes.css", "utf8");

/** The first top-level rule body for a selector. */
function rule(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `${selector} missing from themes.css`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("\n}", open);
  expect(close, `${selector} has no closing brace`).toBeGreaterThan(open);
  return CSS.slice(open + 1, close);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
});

describe("control-geometry tokens (FEAT-0609)", () => {
  it("computes .input-field's height from the token, not a literal", () => {
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue("--control-height")
      .trim();

    expect(token).toBe("42px");

    const input = element("input", "input-field");
    const cs = getComputedStyle(input);

    expect(cs.height).toBe(token);
    expect(cs.maxHeight).toBe(token);
    expect(cs.paddingLeft).toBe("12px");
    expect(cs.borderRadius).toBe("6px");

    // The rule may only name the token, never a pixel height.
    const body = rule(".input-field");
    expect(body).toContain("height: var(--control-height)");
    expect(body).toContain("padding: 0 var(--control-padding-x)");
    expect(body).not.toMatch(/(^|\n)\s*(max-)?height:\s*\d+px/);
  });

  it("keeps .input-field-sm one step smaller, without !important", () => {
    const sm = element("input", "input-field input-field-sm");
    const cs = getComputedStyle(sm);

    expect(cs.height).toBe("34px");
    expect(cs.maxHeight).toBe("34px");
    expect(cs.fontSize).toBe("12px");

    const body = rule(".input-field-sm");
    expect(body).toContain("height: var(--control-height-sm)");
    expect(body).toContain("font-size: var(--control-font-size-sm)");
    expect(body).not.toContain("!important");
    expect(body).not.toMatch(/(max-)?height:\s*\d+px/);
  });

  it("sizes .settings-number-input from the number tokens", () => {
    const input = element("input", "input-field settings-number-input");
    const cs = getComputedStyle(input);

    expect(cs.width).toBe("70px");
    expect(cs.paddingTop).toBe("4px");
    expect(cs.paddingLeft).toBe("8px");

    const body = rule(".settings-number-input");
    expect(body).toContain("width: var(--control-number-width)");
    expect(body).toContain(
      "padding: var(--control-number-padding-y) var(--control-number-padding-x)",
    );
  });

  it("leaves the token set in :root and inherits it in every theme", () => {
    // One declaration, one source: a theme that overrides geometry has to
    // name the token, so it cannot silently re-introduce a literal.
    expect(CSS.match(/--control-height:/g)).toHaveLength(1);

    const themeBlocks = [
      ...CSS.matchAll(/\.theme-(?!default\b)[a-z0-9-]+\s*\{([\s\S]*?)\n\}/gi),
    ];
    expect(themeBlocks.length).toBeGreaterThan(20);
    for (const block of themeBlocks) {
      expect(block[1]).not.toContain("--control-");
    }
  });
});
