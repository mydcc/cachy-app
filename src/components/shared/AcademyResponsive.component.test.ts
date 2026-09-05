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
 * The Trading Academy lives inside a resizable floating window
 * (AcademyWindow in WindowFrame). Viewport breakpoints (`md:`, `lg:`) never
 * fire when that window is resized on a wide desktop viewport, so the whole
 * Academy must respond to its *container* width (`@md:`, `@lg:`) with
 * AcademyContent as the `@container` root. These tests pin that contract:
 * mounting the real views and asserting the responsive classes resolve
 * against the container, never the viewport.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/*
 * svelte-i18n resolved against the real English catalogue, mirroring
 * TpSlList.refusal.component.test.ts. Only classes are asserted here, but
 * the views translate headers/placeholders on mount, so raw $keys must
 * never leak through.
 */
function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}
vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string) => lookup(key) ?? key),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import AcademyContent from "./AcademyContent.svelte";

/*
 * happy-dom gaps, stubbed so the real views (including both canvas charts)
 * can mount:
 * - ResizeObserver (used by ChartPatternChart and Chart.js responsive mode)
 * - Canvas 2D context (used by Chart.js in CandlestickChart). ChartPatternChart
 *   already guards a null context; Chart.js throws on one, so it gets a
 *   no-op proxy context. Rendering output is irrelevant here — only layout.
 */
class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

const gradientStub = { addColorStop: () => {} };
function create2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const state: Record<string, unknown> = {};
    return new Proxy(state, {
        get(target, prop: string) {
            if (prop === "canvas") return canvas;
            if (prop === "measureText") return () => ({ width: 0 });
            if (prop === "getLineDash") return () => [];
            if (
                prop === "createLinearGradient" ||
                prop === "createRadialGradient" ||
                prop === "createPattern"
            )
                return () => gradientStub;
            if (prop === "getImageData")
                return () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 });
            if (prop in target) return target[prop];
            return () => {};
        },
        set(target, prop: string, value: unknown) {
            target[prop] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    HTMLCanvasElement.prototype.getContext = function () {
        return create2dContext(this);
    } as never;
    localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    // No vi.unstubAllGlobals() here: it would also remove
    // vitest.setup.ts's localStorage/sessionStorage stubs, which the views
    // (and later tests in this file) rely on. The ResizeObserver stub above
    // is identical for every test in this file, and stubs never leak into
    // other test files, so leaving it in place is correct.
});

/*
 * Lets Svelte's effects finish. Chart construction (Chart.js) and the
 * markdown actions run in effects, so one microtask is not enough — same
 * reasoning as TpSlList.refusal.component.test.ts's settle().
 */
async function settle(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

async function renderAcademy() {
    component = mount(AcademyContent, { target: host }) as never;
    await settle();
    const root = host.firstElementChild as HTMLElement;
    expect(root, `AcademyContent rendered nothing:\n${host.innerHTML}`).not.toBeNull();
    return root;
}

/** The currently visible pattern view root (chart or candlestick tab). */
function activeViewRoot(root: HTMLElement): HTMLElement {
    // root > tab header + content wrapper > view root
    const content = root.children[1] as HTMLElement;
    const view = content.firstElementChild as HTMLElement;
    expect(view, `no pattern view rendered:\n${host.innerHTML}`).not.toBeNull();
    return view;
}

function splitLayout(view: HTMLElement): HTMLElement {
    const split = [...view.querySelectorAll("div")].find((d) =>
        d.classList.contains("@lg:flex-row"),
    );
    expect(split, `detail split layout missing in:\n${view.innerHTML}`).toBeDefined();
    return split!;
}

/*
 * Fluid-wrap contract: the pattern list and the strategy column keep
 * readable minima (200px / 280px) and the rows wrap instead of squeezing
 * or overflowing when the window is only slightly narrowed.
 */
function expectFluidColumns(view: HTMLElement) {
    const sidebar = view.children[0] as HTMLElement;
    expect(sidebar.classList.contains("@md:min-w-[200px]")).toBe(true);
    const main = view.children[1] as HTMLElement;
    expect(main.classList.contains("@md:min-w-[300px]")).toBe(true);
    /*
     * Regression pin: `@md:flex-wrap` on this row once pushed the whole
     * detail view onto a second flex line — w-1/4 + w-3/4 already sum to
     * 100%, so the 16px gap always forced a wrap and `overflow-hidden`
     * clipped the content away, leaving only the pattern list visible.
     * The row must never wrap; the flexible main column absorbs the gap.
     */
    expect(view.classList.contains("@md:flex-wrap")).toBe(false);
    expect(main.classList.contains("@md:flex-none")).toBe(false);

    const split = splitLayout(view);
    expect(split.classList.contains("@lg:flex-wrap")).toBe(true);
    const left = split.children[0] as HTMLElement;
    const right = split.children[1] as HTMLElement;
    expect(left.classList.contains("@lg:flex-[2_1_320px]")).toBe(true);
    expect(right.classList.contains("@lg:flex-[1_1_280px]")).toBe(true);
}

describe("Academy window resize responsiveness (container queries)", () => {
    it("AcademyContent root is a query container, not viewport-driven", async () => {
        const root = await renderAcademy();

        expect(root.classList.contains("@container")).toBe(true);
        // Padding follows the window width too — viewport `sm:` would stick
        // to p-6 on any wide desktop no matter how narrow the window is.
        expect(root.classList.contains("@sm:p-6")).toBe(true);
        expect(root.classList.contains("sm:p-6")).toBe(false);
    });

    it("ChartPatternsView stacks below the container md breakpoint", async () => {
        const root = await renderAcademy();
        const view = activeViewRoot(root);

        expect(view.classList.contains("@md:flex-row")).toBe(true);
        expect(view.classList.contains("md:flex-row")).toBe(false);

        const sidebar = view.children[0] as HTMLElement;
        expect(sidebar.classList.contains("@md:w-1/4")).toBe(true);
        expect(sidebar.classList.contains("md:w-1/4")).toBe(false);

        expectFluidColumns(view);

        const split = splitLayout(view);
        expect(split.classList.contains("lg:flex-row")).toBe(false);
    });

    it("CandlestickPatternsView stacks below the container md breakpoint", async () => {
        const root = await renderAcademy();

        const tabButtons = root.children[0].querySelectorAll("button");
        expect(tabButtons.length).toBe(2);
        tabButtons[1].click();
        await settle();

        const stored = localStorage.getItem("academy_active_tab");
        expect(stored).toBe("candlestickPatterns");

        const view = activeViewRoot(root);
        expect(view.classList.contains("@md:flex-row")).toBe(true);
        expect(view.classList.contains("md:flex-row")).toBe(false);

        expectFluidColumns(view);

        const split = splitLayout(view);
        expect(split.classList.contains("lg:flex-row")).toBe(false);
    });
});
