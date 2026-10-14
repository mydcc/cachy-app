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
 * FEAT-0683 — the Technicals panel's timeframe chip, through the dropdown it now
 * shares with the Academy lesson.
 *
 * This is the panel's first test, and it exists because the chip's markup moved
 * into `TimeframeDropdown`: without a mount, the panel could lose its chip
 * entirely — or stop writing the pick to `tradeState.analysisTimeframe`, which
 * is the panel's own half of the contract — and every other suite would stay
 * green, because no other suite mounts this component.
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
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

/* The panel registers a market subscription; the shared control does not need it. */
vi.mock("../../services/activeTechnicalsManager.svelte", () => ({
    activeTechnicalsManager: { register: vi.fn(), unregister: vi.fn() },
}));

import TechnicalsPanel from "./TechnicalsPanel.svelte";
import { tradeState } from "../../stores/trade.svelte";
import { settingsState } from "../../stores/settings.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let previousVisibility: boolean;
let previousTimeframe: string;

function renderPanel(): HTMLElement {
    if (component) {
        unmount(component as never);
        component = null;
    }
    host.innerHTML = "";

    component = mount(TechnicalsPanel, {
        target: host,
        props: { isVisible: true },
    }) as never;
    flushSync();

    const root = host.firstElementChild as HTMLElement;
    expect(root, `the panel rendered nothing:\n${host.innerHTML}`).not.toBeNull();
    return root;
}

beforeEach(() => {
    previousVisibility = settingsState.showTechnicals;
    previousTimeframe = tradeState.analysisTimeframe;
    settingsState.showTechnicals = true;
    tradeState.update((state) => ({ ...state, analysisTimeframe: "1h" }));

    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
    settingsState.showTechnicals = previousVisibility;
    tradeState.update((state) => ({ ...state, analysisTimeframe: previousTimeframe }));
});

describe("FEAT-0683 — the panel's timeframe chip", () => {
    it("shows the analysis timeframe and writes the one that is picked", () => {
        const view = renderPanel();

        const chip = view.querySelector<HTMLButtonElement>(
            `[aria-label="${lookup("common.timeframe")}"]`,
        );
        expect(chip, "the panel rendered no timeframe chip").not.toBeNull();
        expect(chip?.textContent?.trim()).toBe("1h");

        chip?.click();
        flushSync();

        const pick = [...view.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "4h",
        );
        if (!pick) throw new Error("no 4h quick pick in the panel's popup");
        pick.click();
        flushSync();

        // The panel's own half: a pick is the analysis timeframe, not a local
        // value. The chip follows it.
        expect(tradeState.analysisTimeframe).toBe("4h");
        expect(
            renderPanel()
                .querySelector<HTMLButtonElement>(`[aria-label="${lookup("common.timeframe")}"]`)
                ?.textContent?.trim(),
        ).toBe("4h");
    });
});
