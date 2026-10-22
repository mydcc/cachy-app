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
 * and compare it to the token the document actually declares. The override case
 * proves the DOM follows the token, not just that both happen to agree.
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

/** Fails when a declaration in the rule body names a raw length. */
function expectNoRawGeometry(body: string): void {
  const normalized = body.replace(/\s+/g, " ");
  expect(normalized).not.toMatch(
    /(?:^|;)\s*(?:max-)?height:\s*[^;]*(?:\d+px|\d+(?:\.\d+)?rem)/,
  );
  expect(normalized).not.toContain("!important");
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
});

describe("control-geometry tokens (FEAT-0609)", () => {
  it("ships the pre-token values (no-op lock; FEAT-0614 updates this)", () => {
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue("--control-height").trim()).toBe("42px");
    expect(root.getPropertyValue("--control-height-sm").trim()).toBe("34px");
    expect(root.getPropertyValue("--control-number-width").trim()).toBe("70px");
  });

  it("computes .input-field's height from the token and follows a change", () => {
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue("--control-height")
      .trim();
    expect(token).toMatch(/^\d+(?:\.\d+)?px$/);

    const input = element("input", "input-field");
    const cs = getComputedStyle(input);
    expect(cs.height).toBe(token);
    expect(cs.maxHeight).toBe(token);
    expect(cs.paddingLeft).toBe("12px");
    expect(cs.borderRadius).toBe("6px");

    // The point of the layer: changing the token changes the rendered control.
    // Without this, "42px literal + 42px token" would satisfy the equality
    // above while proving nothing about the cascade.
    document.documentElement.style.setProperty("--control-height", "32px");
    expect(getComputedStyle(input).height).toBe("32px");

    const body = rule(".input-field");
    expect(body).toContain("height: var(--control-height)");
    expect(body).toContain("padding: 0 var(--control-padding-x)");
    expectNoRawGeometry(body);
  });

  it("keeps .input-field-sm one step smaller, without !important", () => {
    const sm = element("input", "input-field input-field-sm");
    const cs = getComputedStyle(sm);

    expect(cs.height).toBe("34px");
    expect(cs.maxHeight).toBe("34px");
    expect(cs.fontSize).toBe("12px");

    const body = rule(".input-field.input-field-sm");
    expect(body).toContain("height: var(--control-height-sm)");
    expect(body).toContain("font-size: var(--control-font-size-sm)");
    expectNoRawGeometry(body);
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

  it("leaves the token set in :root and lets the shipped themes inherit it", () => {
    // FEAT-0614 added the one deliberate exception this guard was written to
    // force into the open: density is not a theme, so its two blocks on
    // `html[data-density]` may restate the geometry. Every shipped theme still
    // inherits, and the count pin below catches a fourth, unexplained block.
    const declarations = [
      ...CSS.matchAll(/(^|[^\w-])--control-height:/gm),
    ].length;
    expect(declarations).toBe(3);
    expect(CSS.match(/html\[data-density="(compact|wide)"\]\s*\{/g)).toHaveLength(2);

    const themeBlocks = [
      ...CSS.matchAll(/\.theme-(?!default\b)[a-z0-9-]+\s*\{([\s\S]*?)\n\}/gi),
    ];
    expect(themeBlocks.length).toBeGreaterThan(20);
    for (const block of themeBlocks) {
      expect(block[1]).not.toContain("--control-");
    }
  });

  it("keeps the converted .svelte sites on the tokens", () => {
    // These are Tailwind utilities, so happy-dom cannot compute them without
    // the compiled utility sheet. Asserting the token in the source is the
    // cheap guard against a revert to the literal: the browser then resolves
    // the token, which the cases above already prove.
    const sites: Array<[file: string, expected: string, forbidden: string]> = [
      [
        "src/components/inputs/TagInputs.svelte",
        "min-h-[var(--control-height)]",
        "min-h-[42px]",
      ],
      [
        "src/components/shared/TimeframeSelector.svelte",
        "min-h-[var(--control-height)]",
        "min-h-[42px]",
      ],
      [
        // FEAT-0613 moved this control onto the primitive, so the height now
        // comes from `.btn-sm` in themes.css instead of a token in the markup.
        // The guard follows the mechanism: the file has to ask for the size by
        // name, and a revert to a raw 34px button reintroduces the literal.
        "src/components/shared/journal/JournalFilters.svelte",
        'size="sm"',
        "34px",
      ],
    ];

    for (const [file, expected, forbidden] of sites) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} no longer names ${expected}`).toContain(expected);
      expect(source, `${file} reintroduced ${forbidden}`).not.toContain(forbidden);
    }
  });
});
