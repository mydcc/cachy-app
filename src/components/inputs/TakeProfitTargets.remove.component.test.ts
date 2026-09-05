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

/*
 * Removing one take-profit target removes exactly one: the row writes
 * through a single path (app.removeTakeProfitRow). A second writer — the
 * legacy remove event re-handled by the page — deleted the shifted
 * neighbour along with it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
const appMock = vi.hoisted(() => ({
    addTakeProfitRow: vi.fn(),
    removeTakeProfitRow: vi.fn(),
    adjustTpPercentages: vi.fn(),
}));
vi.mock("../../services/app", () => ({ app: appMock }));

const tradeStateMock = vi.hoisted(() => ({ targets: [] as unknown[] }));
vi.mock("../../stores/trade.svelte", () => ({ tradeState: tradeStateMock }));

const settingsStateMock = vi.hoisted(() => ({ showTooltips: true, apiProvider: "bitunix" }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsStateMock }));

vi.mock("../../services/trackingService", () => ({ trackCustomEvent: vi.fn() }));
vi.mock("../../lib/actions", () => ({ trackClick: () => ({ destroy() {} }) }));
vi.mock("../../lib/actions/inputEnhancements", () => ({
    enhancedInput: () => ({ destroy() {} }),
}));

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

import TakeProfitTargets from "./TakeProfitTargets.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function targets() {
    return [
        { price: "70000", percent: "30", isLocked: false },
        { price: "75000", percent: "30", isLocked: false },
        { price: "80000", percent: "40", isLocked: false },
    ];
}

function render(rows: ReturnType<typeof targets>, events: Record<string, (e: CustomEvent<number>) => void> = {}) {
    component = mount(TakeProfitTargets, {
        target: host,
        props: { targets: rows, calculatedTpDetails: [] },
        events,
    }) as unknown as Record<string, unknown>;
    flushSync();
}

function removeButtons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>(".remove-tp-btn"));
}

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});
describe("TakeProfitTargets — removing one row removes exactly one", () => {
    it("calls removeTakeProfitRow once with the clicked index", () => {
        render(targets());
        expect(removeButtons()).toHaveLength(2);

        removeButtons()[0].click();
        flushSync();

        expect(appMock.removeTakeProfitRow).toHaveBeenCalledTimes(1);
        expect(appMock.removeTakeProfitRow).toHaveBeenCalledWith(1);
    });

    it("does not emit a remove event for the page to handle twice", () => {
        // The legacy wiring re-ran the removal in +page (handleTpRemove).
        // With a single writer this listener stays silent.
        const onRemove = vi.fn();
        render(targets(), { remove: onRemove });

        removeButtons()[0].click();
        flushSync();

        expect(onRemove).not.toHaveBeenCalled();
        expect(appMock.removeTakeProfitRow).toHaveBeenCalledTimes(1);
    });

    it("offers no remove button on TP1", () => {
        render(targets());
        // Three rows, but only TP2 and TP3 are removable.
        expect(host.textContent).toContain("TP 1");
        expect(removeButtons()).toHaveLength(2);
    });
});
