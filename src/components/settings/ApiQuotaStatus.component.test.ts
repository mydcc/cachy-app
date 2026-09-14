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
 * FEAT-0346 — ApiQuotaStatus reports how close each news provider is to its
 * API quota. The status colour is the actionable part (a recent 429 is a hard
 * red), and the reset button must be the only thing that clears a counter.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string, values?: Record<string, unknown>): string {
    let current: unknown = en;
    for (const part of key.split(".")) {
        if (!current || typeof current !== "object") return key;
        current = (current as Record<string, unknown>)[part];
    }
    if (typeof current !== "string") return key;
    if (!values) return current;
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        current,
    );
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string, options?: { values?: Record<string, unknown> }) =>
            lookup(key, options?.values),
        ),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

const quotaMock = vi.hoisted(() => ({ getStats: vi.fn(), manualReset: vi.fn() }));
vi.mock("../../services/apiQuotaTracker.svelte", () => ({ apiQuotaTracker: quotaMock }));

import ApiQuotaStatus from "./ApiQuotaStatus.svelte";

const CRYPTO = { resetDate: 4102444800000, totalCalls: 12, failedCalls: 1, last429At: null };
const NEWS = { resetDate: 4102444800000, totalCalls: 4, failedCalls: 0, last429At: null };

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    quotaMock.getStats.mockImplementation((provider: string) =>
        provider === "cryptopanic" ? CRYPTO : NEWS,
    );
    vi.stubGlobal("confirm", vi.fn(() => true));
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
    vi.unstubAllGlobals();
});

function render() {
    component = mount(ApiQuotaStatus, { target: host }) as never;
    flushSync();
}

function buttonByText(text: string): HTMLButtonElement | null {
    return (
        [...host.querySelectorAll<HTMLButtonElement>("button")].find(
            (b) => b.textContent?.trim() === text,
        ) ?? null
    );
}

function dotFor(providerLabel: string): HTMLElement | null {
    const item = [...host.querySelectorAll<HTMLElement>(".quota-item")].find((el) =>
        el.textContent?.includes(providerLabel),
    );
    return item?.querySelector<HTMLElement>(".status-dot") ?? null;
}

describe("FEAT-0346 — ApiQuotaStatus surfaces provider quota health", () => {
    it("shows each provider with its call counts", () => {
        render();

        expect(host.textContent).toContain(lookup("settings.apiQuota.cryptopanic"));
        expect(host.textContent).toContain(lookup("settings.apiQuota.newsapi"));
        expect(host.textContent).toContain("12");
        expect(host.textContent).toContain("4");
        expect(host.querySelectorAll(".quota-item")).toHaveLength(2);
    });

    it("says so when neither provider has been called", () => {
        quotaMock.getStats.mockReturnValue(null);
        render();

        expect(host.textContent).toContain(lookup("settings.apiQuota.noCalls"));
        expect(host.querySelectorAll(".quota-item")).toHaveLength(0);
    });

    it("resets the provider a user confirms", () => {
        render();

        buttonByText(lookup("settings.apiQuota.resetButton"))?.click();

        expect(quotaMock.manualReset).toHaveBeenCalledWith("cryptopanic");
    });

    it("turns the dot red after a fresh 429", () => {
        quotaMock.getStats.mockImplementation((provider: string) =>
            provider === "cryptopanic" ? { ...CRYPTO, last429At: Date.now() } : NEWS,
        );
        render();

        expect(dotFor(lookup("settings.apiQuota.cryptopanic"))?.getAttribute("style")).toContain(
            "--danger-color",
        );
    });
});
