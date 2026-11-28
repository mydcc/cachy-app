// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { Decimal } from "decimal.js";
import en from "../../../locales/locales/en.json";
import de from "../../../locales/locales/de.json";
import GridBotEditor from "./GridBotEditor.svelte";
import type { EvaluationCandle, GridDocument } from "../../../lib/rules/types";

function lookup(bundle: Record<string, unknown>, key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], bundle) as string;
}

function makeTranslator(bundle: Record<string, unknown>) {
    return (key: string, values?: Record<string, unknown>) => {
        const template = lookup(bundle, key) ?? key;
        return Object.entries(values ?? {}).reduce(
            (text, [name, val]) => text.replaceAll(`{${name}}`, String(val)),
            template,
        );
    };
}

function setInput(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

describe("GridBotEditor — FEAT-0819 stage 5 + FEAT-0820", () => {
    let host: HTMLElement;
    let component: ReturnType<typeof mount> | null = null;

    beforeEach(() => {
        host = document.createElement("div");
        document.body.appendChild(host);
    });

    afterEach(() => {
        if (component) unmount(component);
        component = null;
        host.remove();
    });

    it("warns when spacing does not exceed round-trip fee, shows inward tick rounding, offers explicit ATR suggestion, and displays pre-start budget & worst-case loss", () => {
        const candles: EvaluationCandle[] = Array.from({ length: 20 }, (_, i) => ({
            open_time_ms: (i + 1) * 3_600_000,
            open: "95000",
            high: "96000",
            low: "94000",
            close: "95000",
            volume: "5",
        }));
        const onsave = vi.fn(() => null);

        component = mount(GridBotEditor, {
            target: host,
            props: {
                grid: null,
                feeRate: new Decimal("0.0006"),
                accountEquity: new Decimal("10000"),
                candlesFor: () => candles,
                stepsFor: () => ({ priceStep: new Decimal("10"), quantityStep: new Decimal("0.001") }),
                t: makeTranslator(en as Record<string, unknown>),
                onsave,
                oncancel: vi.fn(),
            },
        });
        flushSync();

        // Tight range with unaligned bounds triggers both inward tick rounding and fee warning
        setInput(host.querySelector<HTMLInputElement>("#grid-create-lower")!, "100003");
        setInput(host.querySelector<HTMLInputElement>("#grid-create-upper")!, "100197");
        setInput(host.querySelector<HTMLInputElement>("#grid-create-levels")!, "5");
        setInput(host.querySelector<HTMLInputElement>("#grid-create-budget")!, "1000");
        setInput(host.querySelector<HTMLInputElement>("#grid-create-stopout-0-value")!, "99000");

        const stepNotice = host.querySelector<HTMLElement>('[data-testid="grid-step-rounding-notice"]');
        expect(stepNotice).not.toBeNull();
        expect(stepNotice!.textContent).toContain("100010");
        expect(stepNotice!.textContent).toContain("100190");

        const feeWarning = host.querySelector<HTMLElement>('[data-testid="grid-fee-warning"]');
        expect(feeWarning).not.toBeNull();
        expect(feeWarning!.textContent).toContain("0.120%");

        // Widen range to 90000 - 100000: fee warning clears, ATR suggestion offers 5 levels (not auto-applied!)
        setInput(host.querySelector<HTMLInputElement>("#grid-create-levels")!, "8");
        setInput(host.querySelector<HTMLInputElement>("#grid-create-lower")!, "90000");
        setInput(host.querySelector<HTMLInputElement>("#grid-create-upper")!, "100000");
        setInput(host.querySelector<HTMLInputElement>("#grid-create-stopout-0-value")!, "85000");

        expect(host.querySelector('[data-testid="grid-fee-warning"]')).toBeNull();
        expect(host.querySelector<HTMLInputElement>("#grid-create-levels")!.value).toBe("8");

        const atrBanner = host.querySelector<HTMLElement>('[data-testid="grid-atr-suggestion"]');
        expect(atrBanner).not.toBeNull();
        expect(atrBanner!.textContent).toContain("2000.00");
        host.querySelector<HTMLButtonElement>('[data-testid="grid-atr-apply"]')!.click();
        flushSync();
        expect(host.querySelector<HTMLInputElement>("#grid-create-levels")!.value).toBe("5");

        // Pre-start budget and worst-case loss (quote amount + % of paper account)
        const prestart = host.querySelector<HTMLElement>('[data-testid="grid-prestart-summary"]');
        expect(prestart).not.toBeNull();
        expect(prestart!.textContent).toContain("USDT");
        expect(prestart!.textContent).toContain("% of paper account");

        // Save produces a valid GridDocument with quote_budget sizing and mandatory stop_out
        host.querySelector<HTMLButtonElement>('[data-testid="grid-editor-save"]')!.click();
        flushSync();
        expect(onsave).toHaveBeenCalledTimes(1);
        const saved = onsave.mock.calls[0][0] as GridDocument;
        expect(saved.kind).toBe("grid");
        expect(saved.sizing).toEqual({ basis: "quote_budget", amount: "1000" });
        expect(saved.level_count).toBe(5);
        expect(saved.stop_out).toHaveLength(1);
    });

    it("refuses saving when mandatory stop-out rules are removed, in both EN and DE locales", () => {
        const onsave = vi.fn(() => null);
        component = mount(GridBotEditor, {
            target: host,
            props: {
                grid: null,
                feeRate: new Decimal("0.0006"),
                accountEquity: new Decimal("10000"),
                t: makeTranslator(de as Record<string, unknown>),
                onsave,
                oncancel: vi.fn(),
            },
        });
        flushSync();

        setInput(host.querySelector<HTMLInputElement>("#grid-create-lower")!, "90000");
        setInput(host.querySelector<HTMLInputElement>("#grid-create-upper")!, "100000");

        // Remove the default stop-out row
        const removeButtons = [...host.querySelectorAll("button")].filter(
            (btn) => btn.textContent?.trim() === lookup(de as Record<string, unknown>, "settings.automation.grid.stopOutRemove"),
        );
        expect(removeButtons).toHaveLength(1);
        removeButtons[0].click();
        flushSync();

        host.querySelector<HTMLButtonElement>('[data-testid="grid-editor-save"]')!.click();
        flushSync();

        expect(onsave).not.toHaveBeenCalled();
        const refusal = host.querySelector<HTMLElement>('[data-testid="grid-editor-refusal"]');
        expect(refusal).not.toBeNull();
        expect(refusal!.textContent).toContain(
            lookup(de as Record<string, unknown>, "settings.automation.grid.stopOutRequired"),
        );
    });
});
