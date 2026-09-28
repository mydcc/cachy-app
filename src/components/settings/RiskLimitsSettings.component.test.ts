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

// @vitest-environment happy-dom

/*
 * BUG-0557 at the surface the user actually types into.
 *
 * The store's own rules are covered by `rmsService_riskLimits.test.ts`.
 * What only a mounted component can show is the wiring around them: that
 * clearing the field really stores "no limit" instead of zero, that junk is
 * refused inline while the previously stored ceiling survives, and that a
 * rejected field keeps its own error until that field — and only that field —
 * is edited again.
 *
 * Translation is looked up in the real `en.json`, so a missing key fails here
 * instead of rendering as a raw key in production.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import de from "../../locales/locales/de.json";
import { CONSTANTS } from "../../lib/constants";

/** Resolves a dotted key against a locale bundle, as `$_` would. */
function lookup(bundle: unknown, key: string): string {
    const value = key
        .split(".")
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
    return typeof value === "string" ? value : key;
}

const locale = vi.hoisted(() => ({ current: "en" as "en" | "de" }));

vi.mock("../../locales/i18n", async () => {
    const enBundle = (await import("../../locales/locales/en.json")).default;
    const deBundle = (await import("../../locales/locales/de.json")).default;
    const resolve = (key: string) => {
        const bundle = locale.current === "de" ? deBundle : enBundle;
        const value = key
            .split(".")
            .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);
        return typeof value === "string" ? value : key;
    };

    return {
        _: {
            subscribe: (run: (value: (key: string) => string) => void) => {
                run(resolve);
                return () => {};
            },
        },
        locale: {
            subscribe: (run: (value: string) => void) => {
                run(locale.current);
                return () => {};
            },
        },
        setLocale: vi.fn(),
    };
});

// The heavy window/toast layer behind these stores is irrelevant here and
// drags half the app into a component test; the form only calls `show` on
// confirm and `showError` when persisting fails.
vi.mock("../../stores/ui.svelte", () => ({
    uiState: { showError: vi.fn(), showFeedback: vi.fn() },
}));
vi.mock("../../stores/modal.svelte", () => ({
    modalState: { show: vi.fn(async () => false) },
}));
vi.mock("../../stores/journal.svelte", () => ({
    journalState: { entries: [] },
}));
vi.mock("../../stores/closeAllFlow", () => ({
    confirmAndCloseAllPositions: vi.fn(async () => {}),
}));
vi.mock("../../services/rmsService", async () => {
    const { Decimal } = await import("decimal.js");
    return {
        rmsService: { realizedPnlToday: () => new Decimal(0) },
        utcDayStart: (now: number) => now,
    };
});

import RiskLimitsSettings from "./RiskLimitsSettings.svelte";
import { riskState } from "../../stores/riskLimits.svelte";
import { modalState } from "../../stores/modal.svelte";

let host: HTMLDivElement;
let component: Record<string, unknown> | null = null;

function input(id: string): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>(`#${id}`);
    if (!el) throw new Error(`#${id} not rendered`);
    return el;
}

function typeInto(el: HTMLInputElement, value: string): void {
    el.dispatchEvent(new Event("focus"));
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

function errorVisible(bundle: "en" | "de" = "en", key?: string): boolean {
    const translations = bundle === "de" ? de : en;
    const text = host.textContent ?? "";
    if (key) return text.includes(lookup(translations, key));
    return text.includes(lookup(translations, "settings.risk.invalidValue")) ||
        text.includes(lookup(translations, "settings.risk.invalidMaxOpenPositions"));
}

function button(label: string): HTMLButtonElement {
    const match = Array.from(host.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === label,
    );
    if (!match) throw new Error(`Button not found: ${label}`);
    return match;
}

function maxPositions(): HTMLInputElement {
    return input("risk-maxOpenPositions");
}

beforeEach(() => {
    locale.current = "en";
    localStorage.clear();
    riskState.reloadFromStorage();
    riskState.resetLimits();
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(RiskLimitsSettings, { target: host }) as Record<string, unknown>;
    flushSync();
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    localStorage.clear();
});

describe("BUG-0557 — RiskLimitsSettings keeps no-limit and zero apart", () => {
    it("stores a positive integer and shows no error", () => {
        typeInto(maxPositions(), "3");

        expect(riskState.maxOpenPositions).toBe(3);
        expect(errorVisible()).toBe(false);
        expect(maxPositions().classList.contains("border-danger")).toBe(false);
    });

    it("clears the stored limit when the field is emptied", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();
        expect(maxPositions().value).toBe("2");

        typeInto(maxPositions(), "");

        expect(riskState.maxOpenPositions).toBe(null);
        expect(maxPositions().placeholder).toBe(
            lookup(en, "settings.risk.notConfigured"),
        );
        expect(errorVisible()).toBe(false);
    });

    it("clears the stored limit when only whitespace is typed", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();

        typeInto(maxPositions(), "   ");

        expect(riskState.maxOpenPositions).toBe(null);
        expect(errorVisible()).toBe(false);
    });

    it.each(["2.5", "abc", "1,5"])(
        "rejects %s inline without changing the stored limit",
        (bad) => {
            riskState.setLimit("maxOpenPositions", 2);
            flushSync();

            typeInto(maxPositions(), bad);

            expect(riskState.maxOpenPositions).toBe(2);
            expect(errorVisible()).toBe(true);
            expect(maxPositions().value).toBe(bad);
            expect(maxPositions().classList.contains("border-danger")).toBe(true);
        },
    );

    it("rejects a count string the store refuses instead of parsing it itself", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();

        // "1e3" is a valid number but not a count of positions: the form used
        // to parseInt it into 1000 before the store could refuse it.
        typeInto(maxPositions(), "1e3");

        expect(riskState.maxOpenPositions).toBe(2);
        expect(errorVisible()).toBe(true);
    });

    it("keeps a rejected field's error when a different field is edited", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();
        typeInto(maxPositions(), "2.5");
        expect(errorVisible()).toBe(true);

        typeInto(input("risk-maxLeverage"), "5");

        expect(riskState.limits.maxLeverage).toBe("5");
        expect(riskState.maxOpenPositions).toBe(2);
        expect(errorVisible()).toBe(true);
        expect(maxPositions().classList.contains("border-danger")).toBe(true);
        expect(maxPositions().value).toBe("2.5");
    });

    it("keeps separate field errors simultaneously visible", () => {
        typeInto(input("risk-maxLeverage"), "-1");
        typeInto(maxPositions(), "2.5");

        expect(input("risk-maxLeverage").classList.contains("border-danger")).toBe(true);
        expect(maxPositions().classList.contains("border-danger")).toBe(true);
        expect(errorVisible("en", "settings.risk.invalidValue")).toBe(true);
        expect(errorVisible("en", "settings.risk.invalidMaxOpenPositions")).toBe(true);
    });

    it("clears every field error after a confirmed reset", async () => {
        typeInto(input("risk-maxLeverage"), "-1");
        typeInto(maxPositions(), "2.5");
        expect(errorVisible()).toBe(true);

        vi.mocked(modalState.show).mockResolvedValueOnce(true);
        button(lookup(en, "settings.risk.resetLimits")).click();
        await vi.waitFor(() => {
            expect(errorVisible()).toBe(false);
        });

        expect(input("risk-maxLeverage").classList.contains("border-danger")).toBe(false);
        expect(maxPositions().classList.contains("border-danger")).toBe(false);
    });

    it("renders the integer-specific max-position error in German", () => {
        locale.current = "de";
        unmount(component!);
        component = mount(RiskLimitsSettings, { target: host }) as Record<string, unknown>;
        flushSync();

        typeInto(maxPositions(), "2.5");

        expect(errorVisible("de", "settings.risk.invalidMaxOpenPositions")).toBe(true);
        expect(lookup(de, "settings.risk.invalidMaxOpenPositions")).toBe(
            "Dieser Wert wurde nicht gespeichert. Das Limit für gleichzeitig offene Positionen muss eine ganze, nicht negative Zahl sein.",
        );
    });

    it("uses exact whole non-negative integer copy in both locales", () => {
        expect(lookup(en, "settings.risk.invalidMaxOpenPositions")).toBe(
            "That value was not stored. Max concurrent open positions must be a whole non-negative integer.",
        );
        expect(lookup(de, "settings.risk.invalidMaxOpenPositions")).toBe(
            "Dieser Wert wurde nicht gespeichert. Das Limit für gleichzeitig offene Positionen muss eine ganze, nicht negative Zahl sein.",
        );
    });

    it("surfaces an unreadable stored ceiling as a repairable invalid state", () => {
        unmount(component!);
        localStorage.setItem(
            CONSTANTS.LOCAL_STORAGE_RISK_KEY,
            JSON.stringify({ limits: { maxOpenPositions: "2.5" } }),
        );
        riskState.reloadFromStorage();
        component = mount(RiskLimitsSettings, { target: host }) as Record<string, unknown>;
        flushSync();

        expect(riskState.hasInvalidMaxOpenPositions).toBe(true);
        expect(errorVisible("en", "settings.risk.invalidStoredMaxOpenPositions")).toBe(true);
        expect(maxPositions().value).toBe("2.5");
        expect(maxPositions().getAttribute("aria-invalid")).toBe("true");
        expect(maxPositions().getAttribute("aria-describedby")).toBe(
            "risk-maxOpenPositions-stored-error",
        );
    });

    it("clears the error once the same field holds a valid value", () => {
        riskState.setLimit("maxOpenPositions", 2);
        flushSync();
        typeInto(maxPositions(), "2.5");
        expect(errorVisible()).toBe(true);

        typeInto(maxPositions(), "3");

        expect(riskState.maxOpenPositions).toBe(3);
        expect(errorVisible()).toBe(false);
        expect(maxPositions().classList.contains("border-danger")).toBe(false);
    });

    it("renders the count as a text input with a numeric keypad", () => {
        // type="number" silently clears the field when the user pastes "1,000"
        // or types an intermediate "2.", so the raw text has to survive.
        expect(maxPositions().type).toBe("text");
        expect(maxPositions().getAttribute("inputmode")).toBe("numeric");
        expect(maxPositions().hasAttribute("min")).toBe(false);
        expect(maxPositions().hasAttribute("step")).toBe(false);
    });
});
