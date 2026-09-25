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
 * FEAT-0346 — AccountSummary is the account read-out the trader sizes from.
 * The tests pin the sign handling on PnL (a positive PnL must read "+", a
 * negative one must be red), the error surface, and that a zero position size
 * stays hidden instead of printing a meaningless row.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    const translate = (key: string, options?: { values?: Record<string, string | number> }) => {
        const text = lookup(key) ?? key;
        if (!options?.values) return text;
        return Object.entries(options.values).reduce(
            (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
            text
        );
    };
    return { _: r(translate), locale: r("en"), setLocale: vi.fn() };
});

// The real formatter trims a whole number to "1000"; these tests pin the
// two-decimal display the account read-out promises, so keep the override
// but leave every other util importable for the real AccountTooltip.
vi.mock("../../utils/utils", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../utils/utils")>();
    return {
        ...actual,
        formatDynamicDecimal: (value: unknown) => Number(value).toFixed(2),
    };
});

import AccountSummary from "./AccountSummary.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    component = mount(AccountSummary, { target: host, props }) as never;
    flushSync();
}

describe("FEAT-0346 — AccountSummary reports the account honestly", () => {
    it("prints the balance and margin in the account currency", () => {
        render({ available: 1000, margin: 250, currency: "USDT" });

        expect(host.textContent).toContain("1000.00 USDT");
        expect(host.textContent).toContain("250.00 USDT");
    });

    it("carries the sign of a positive PnL", () => {
        render({ pnl: 12.5 });

        expect(host.textContent).toContain("+12.50");
        expect(host.querySelector('span[class*="--success-color"]')).toBeTruthy();
    });

    it("marks a negative PnL as a loss", () => {
        render({ pnl: -7.25 });

        expect(host.textContent).toContain("-7.25");
        expect(host.querySelector('span[class*="--danger-color"]')).toBeTruthy();
    });

    it("shows the fetch error instead of a silent all-zero account", () => {
        render({ error: "Account fetch failed" });

        expect(host.textContent).toContain("Account fetch failed");
    });

    it("only shows the total position size when there is one", () => {
        render({ totalPositionSize: 0 });
        expect(host.textContent).not.toContain(lookup("dashboard.account.totalPositionSize"));

        unmount(component as never);
        component = null;
        host.innerHTML = "";
        render({ totalPositionSize: 1500 });
        expect(host.textContent).toContain(lookup("dashboard.account.totalPositionSize"));
        expect(host.textContent).toContain("1500.00 USDT");
    });
});

describe("BUG-0512 — the total wears the badge when any leg is not fresh", () => {
    it("badges a total built from stale-priced legs", () => {
        render({ pnl: 12.5, pnlStale: true });

        const badge = host.querySelector('[data-track-id="stale-price-badge"]');
        expect(badge).not.toBeNull();
        // The number stays — labelled, never silently exact.
        expect(host.textContent).toContain("+12.50");
        // The total hint names the mix (stale included, unpriced excluded),
        // not the row-level wording.
        expect(badge?.getAttribute("title")).toBe(lookup("positionsList.staleTotalHint"));
    });

    it("shows no badge for a freshly priced total", () => {
        render({ pnl: 12.5 });

        expect(host.querySelector('[data-track-id="stale-price-badge"]')).toBeNull();
    });
});

describe("BUG-0562 — account details are a disclosure, not a hover", () => {
    function trigger(): HTMLButtonElement {
        const el = host.querySelector<HTMLButtonElement>("button[aria-expanded]");
        expect(el).not.toBeNull();
        return el as HTMLButtonElement;
    }

    function panel(): HTMLElement | null {
        return host.querySelector('[id^="account-details-panel-"]');
    }

    function wrapper(): HTMLElement {
        const el = trigger().parentElement;
        expect(el).not.toBeNull();
        return el as HTMLElement;
    }

    function key(el: HTMLElement, keyName: string) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true }));
        flushSync();
    }

    function activate(el: HTMLElement) {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
        flushSync();
    }

    function blur(el: HTMLElement, relatedTarget: EventTarget | null = null) {
        el.dispatchEvent(new FocusEvent("blur", { relatedTarget }));
        flushSync();
    }

    it("uses a native button named from its visible content", () => {
        render({ available: 1000, currency: "USDT" });

        expect(trigger().tagName).toBe("BUTTON");
        expect(trigger().type).toBe("button");
        expect(trigger().getAttribute("aria-label")).toBeNull();
        expect(trigger().hasAttribute("tabindex")).toBe(false);
        const name = trigger().textContent ?? "";
        expect(name).toContain(lookup("dashboard.account.balance"));
        expect(name).toContain("1000.00 USDT");
    });

    it("opens and closes with Enter", () => {
        render({ available: 1000 });

        activate(trigger());
        expect(trigger().getAttribute("aria-expanded")).toBe("true");
        expect(panel()).not.toBeNull();

        activate(trigger());
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
        expect(panel()).toBeNull();
    });

    it("opens and closes with Space", () => {
        render({ available: 1000 });

        activate(trigger());
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        activate(trigger());
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
    });

    it("toggles a hover-opened panel closed on the following pointer click", () => {
        render({ available: 1000 });
        wrapper().dispatchEvent(new MouseEvent("mouseenter"));
        flushSync();
        trigger().dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
        flushSync();

        expect(panel()).toBeNull();
    });

    it("wires aria-controls to the panel id only while open", () => {
        render({ available: 1000 });

        expect(trigger().getAttribute("aria-controls")).toBeNull();

        activate(trigger());
        expect(trigger().getAttribute("aria-controls")).toMatch(/^account-details-panel-/);

        activate(trigger());
        expect(trigger().getAttribute("aria-controls")).toBeNull();
    });

    it("renders the equity and margin details (AC4)", () => {
        render({ available: 1000, margin: 250, currency: "USDT" });

        activate(trigger());
        const details = panel();
        expect(details).not.toBeNull();
        const text = details?.textContent ?? "";
        expect(text).toContain(lookup("dashboard.account.totalEquity"));
        expect(text).toContain("1250.00");
        expect(text).toContain(lookup("dashboard.account.marginLevel"));
        expect(text).toContain("20.0");
    });

    it("opens on focus alone and closes on blur", () => {
        render({ available: 1000 });

        trigger().focus();
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        trigger().blur();
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
    });

    it("closes when the tap moves outside the disclosure (AC3)", () => {
        const outside = document.createElement("button");
        document.body.appendChild(outside);
        render({ available: 1000 });

        trigger().focus();
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        blur(trigger(), outside);
        expect(trigger().getAttribute("aria-expanded")).toBe("false");

        outside.remove();
    });

    it("closes on an outside pointerdown or tap", () => {
        const outside = document.createElement("button");
        document.body.appendChild(outside);
        render({ available: 1000 });

        activate(trigger());
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("false");

        outside.remove();
    });

    it("stays open while the pointer rests inside the panel", () => {
        render({ available: 1000 });

        trigger().focus();
        flushSync();
        const details = panel();
        expect(details).not.toBeNull();

        details?.dispatchEvent(new MouseEvent("mouseenter"));
        flushSync();
        blur(trigger());
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        details?.dispatchEvent(new MouseEvent("mouseleave"));
        flushSync();
        blur(trigger());
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
    });

    it("stays open on mouseleave while the trigger holds focus (finding 7)", () => {
        render({ available: 1000 });

        trigger().focus();
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        wrapper().dispatchEvent(new MouseEvent("mouseleave"));
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        trigger().blur();
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
    });

    it("clears stale pointer-over-panel state when Escape unmounts it", () => {
        render({ available: 1000 });
        trigger().focus();
        flushSync();
        panel()?.dispatchEvent(new MouseEvent("mouseenter"));
        flushSync();

        key(trigger(), "Escape");
        expect(panel()).toBeNull();

        activate(trigger());
        expect(panel()).not.toBeNull();
        blur(trigger());
        expect(panel()).toBeNull();
    });

    it("closes on Escape and keeps focus on the trigger", () => {
        render({ available: 1000 });

        // A keyboard user is focused on the disclosure when pressing Escape.
        trigger().focus();
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        key(trigger(), "Escape");
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(trigger());
    });

    it("closes on Escape from the document listener when focus is elsewhere (finding 8)", () => {
        render({ available: 1000 });

        wrapper().dispatchEvent(new MouseEvent("mouseenter"));
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
    });
});
