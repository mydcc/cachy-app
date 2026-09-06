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
 * Chart pattern content lives in chartPatterns.<id> locale entries. These
 * tests mount the real view and prove the wiring end to end: English
 * renders English, German renders German, and no "No description
 * available." fallback leaks through for a fully translated pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import de from "../../locales/locales/de.json";

vi.mock("../../services/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const activeLocale = vi.hoisted(() => ({ current: "en" }));

function lookup(key: string): string {
    const dict = activeLocale.current === "de" ? de : en;
    const template = key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dict);
    return typeof template === "string" ? template : key;
}
vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string) => lookup(key) ?? key),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import ChartPatternsView from "./ChartPatternsView.svelte";

class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    activeLocale.current = "en";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

async function settle(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

async function renderView() {
    component = mount(ChartPatternsView, { target: host }) as never;
    await settle();
    return host;
}

describe("Chart Patterns Academy translations", () => {
    it("renders English content when locale is en", async () => {
        const root = await renderView();
        const title = root.querySelector("h2");
        expect(title?.textContent).toContain("H&S (Head and Shoulders)");
        expect(root.innerHTML).toContain("Reversal");
        expect(root.innerHTML).not.toContain("Umkehrmuster");
        expect(root.innerHTML).not.toContain("No description available.");
        // headAndShoulders has 4 characteristics in both locales
        const items = root.querySelectorAll("ul li");
        expect(items.length).toBe(4);
        expect(items[0]?.textContent).toContain("Occurs after an uptrend.");
    });

    it("renders German content when locale is de", async () => {
        activeLocale.current = "de";
        const root = await renderView();
        const title = root.querySelector("h2");
        expect(title?.textContent).toContain("SKS (Schulter-Kopf-Schulter)");
        expect(root.innerHTML).toContain("Umkehrmuster");
        expect(root.innerHTML).not.toContain("No description available.");
        const items = root.querySelectorAll("ul li");
        expect(items.length).toBe(4);
        expect(items[0]?.textContent).toContain("Tritt nach einem Aufwärtstrend auf.");
    });
});
