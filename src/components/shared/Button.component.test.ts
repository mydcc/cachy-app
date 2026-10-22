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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0346 — Button is the app's button primitive. It has to forward its
 * label to both `title` and `aria-label` so an icon-only button is still
 * named, and a disabled button must not fire.
 *
 * FEAT-0610 — the primitive now carries the colour roles and the three control
 * heights the app already uses. The size cases read the computed height, so a
 * token change reaches the rendered button; the variant cases assert the
 * mapping is not collapsed onto one colour.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync, createRawSnippet } from "svelte";

vi.mock("../../services/trackingService", () => ({
    trackCustomEvent: vi.fn(),
}));

import { trackCustomEvent } from "../../services/trackingService";
import Button from "./Button.svelte";

const THEMES = readFileSync("src/themes.css", "utf8");

const children = createRawSnippet(() => ({
    render: () => `<span data-testid="child">Click me</span>`,
}));

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = THEMES;
    document.head.appendChild(style);
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    component = mount(Button, { target: host, props: { children, ...props } }) as never;
    flushSync();
}

function button(): HTMLButtonElement {
    const el = host.querySelector<HTMLButtonElement>("button");
    if (!el) throw new Error("button not rendered");
    return el;
}

describe("FEAT-0346 — Button forwards its label and honours disabled", () => {
    it("renders its children and fires onClick", () => {
        const onClick = vi.fn();
        render({ onClick });

        expect(host.querySelector('[data-testid="child"]')?.textContent).toBe("Click me");
        button().click();
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("names the button from its title when no aria-label is given", () => {
        render({ title: "Save preset" });

        expect(button().getAttribute("title")).toBe("Save preset");
        expect(button().getAttribute("aria-label")).toBe("Save preset");
    });

    it("prefers an explicit aria-label over the title", () => {
        render({ title: "Save", ariaLabel: "Save the active preset" });

        expect(button().getAttribute("aria-label")).toBe("Save the active preset");
    });

    it("does not fire while disabled", () => {
        const onClick = vi.fn();
        render({ onClick, disabled: true });

        expect(button().disabled).toBe(true);
        button().click();
        expect(onClick).not.toHaveBeenCalled();
    });

    it("applies caller classes", () => {
        render({ extraClasses: "my-custom-class" });

        expect(button().classList.contains("my-custom-class")).toBe(true);
    });
});

describe("FEAT-0610 — variants, sizes and events", () => {
    it("takes the three heights from the control tokens", () => {
        const expected = { sm: "34px", md: "42px", lg: "48px" } as const;

        for (const [size, height] of Object.entries(expected)) {
            if (component) unmount(component as never);
            component = null;
            host.innerHTML = "";
            render({ size });

            expect(getComputedStyle(button()).height, size).toBe(height);
        }
    });

    it("maps each variant onto its own --btn-* colour pair", () => {
        const colours = new Map<string, string>();

        for (const variant of ["default", "accent", "danger", "success", "warning"]) {
            if (component) unmount(component as never);
            component = null;
            host.innerHTML = "";
            render({ variant });

            const el = button();
            expect(el.classList.contains(`btn-${variant}`), variant).toBe(true);

            // Resolve the expected fill through a probe, so a swapped mapping
            // (danger <-> success) fails instead of passing on distinctness.
            const probe = document.createElement("div");
            probe.style.backgroundColor = `var(--btn-${variant}-bg)`;
            document.body.appendChild(probe);
            const expected = getComputedStyle(probe).backgroundColor;
            probe.remove();

            const background = getComputedStyle(el).backgroundColor;
            expect(background, variant).not.toBe("rgba(0, 0, 0, 0)");
            expect(background, variant).toBe(expected);
            colours.set(variant, background);
        }

        expect(new Set(colours.values()).size).toBe(5);
    });

    it("keeps the text variants transparent and the outline variant bordered", () => {
        const cases: Array<[string, string]> = [
            ["ghost", "--accent-color"],
            ["ghost-danger", "--danger-color"],
            // FEAT-0612: the calculator's icon actions are quiet at rest and
            // answer a hover with the accent colour (asserted from the sheet
            // below — happy-dom cannot evaluate `:hover`).
            ["ghost-muted", "--text-secondary"],
        ];

        for (const [variant, colourVar] of cases) {
            if (component) unmount(component as never);
            component = null;
            host.innerHTML = "";
            render({ variant });

            const el = button();
            const probe = document.createElement("div");
            probe.style.color = `var(${colourVar})`;
            document.body.appendChild(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();

            expect(
                ["transparent", "rgba(0, 0, 0, 0)"],
                variant,
            ).toContain(getComputedStyle(el).backgroundColor);
            expect(getComputedStyle(el).color, variant).toBe(expected);
        }

        if (component) unmount(component as never);
        component = null;
        host.innerHTML = "";
        render({ variant: "outline" });

        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--bg-tertiary)";
        document.body.appendChild(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();

        expect(getComputedStyle(button()).backgroundColor).toBe(expected);
        expect(getComputedStyle(button()).borderTopWidth).toBe("1px");

        // `outline-accent` (FEAT-0611 stage 2) is transparent at rest, keeps
        // the accent border and takes the accent colour for its label.
        if (component) unmount(component as never);
        component = null;
        host.innerHTML = "";
        render({ variant: "outline-accent" });

        const accentProbe = document.createElement("div");
        accentProbe.style.color = "var(--accent-color)";
        document.body.appendChild(accentProbe);
        const accent = getComputedStyle(accentProbe).color;
        accentProbe.remove();

        const outlined = button();
        expect(
            ["transparent", "rgba(0, 0, 0, 0)"],
        ).toContain(getComputedStyle(outlined).backgroundColor);
        expect(getComputedStyle(outlined).color).toBe(accent);
        expect(getComputedStyle(outlined).borderTopWidth).toBe("1px");

        // The muted variant's hover is what makes it an action at all: an
        // icon-only button has no text to underline, so `ghost`'s hover would
        // be invisible (FEAT-0612). happy-dom cannot evaluate `:hover`, so the
        // rule is asserted from the sheet.
        expect(readFileSync("src/themes.css", "utf8")).toMatch(
            /\.btn-base\.btn-ghost-muted:hover:not\(:disabled\)\s*\{\s*color:\s*var\(--accent-color\)/,
        );
    });

    it("does not style a raw variant class without .btn-base", () => {
        // JournalContent carries bare `.btn-danger` etc. as inert tokens; the
        // primitive's variants must not reach them (FEAT-0613 owns that).
        const raw = document.createElement("button");
        raw.className = "btn-danger";
        document.body.appendChild(raw);

        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--btn-danger-bg)";
        document.body.appendChild(probe);
        const fill = getComputedStyle(probe).backgroundColor;

        expect(getComputedStyle(raw).backgroundColor).not.toBe(fill);
        probe.remove();
        raw.remove();
    });

    it("names the transitioned properties instead of transitioning all", () => {
        render();

        const transition = getComputedStyle(button()).transition;
        expect(transition).toContain("background-color");
        expect(transition).not.toMatch(/(^|,\s*)all(\s|,|$)/);
    });

    it("defaults to type=button so a form cannot be submitted accidentally", () => {
        render();

        expect(button().getAttribute("type")).toBe("button");
    });

    it("forwards a contextmenu handler (the theme switcher's right click)", () => {
        const oncontextmenu = vi.fn((event: MouseEvent) => event.preventDefault());
        render({ oncontextmenu });

        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        button().dispatchEvent(event);

        expect(oncontextmenu).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it("fires the analytics action and still calls onClick", () => {
        const onClick = vi.fn();
        render({
            onClick,
            track: { category: "Presets", action: "Click", name: "SavePreset" },
        });

        button().click();

        expect(trackCustomEvent).toHaveBeenCalledWith("Presets", "Click", "SavePreset");
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("does not track when no action is passed", () => {
        render();

        button().click();

        expect(trackCustomEvent).not.toHaveBeenCalled();
    });
});
