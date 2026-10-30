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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * BUG-0718 — with one analysis timeframe left, its toggle refuses the click in
 * the handler. It used to look selected and clickable and do nothing.
 *
 * The chosen fix is to mark the last one unavailable with a visible reason,
 * rather than to remove it and auto-select a replacement.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    const value = key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        );
    if (typeof value !== "string") {
        throw new Error(`missing i18n key: ${key}`);
    }
    return value;
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key)),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import CalculationSettings from "./CalculationSettings.svelte";
import { settingsState } from "../../stores/settings.svelte";

let host: HTMLDivElement;
let component: Record<string, unknown> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(CalculationSettings, { target: host }) as never;
    flushSync();
}

function timeframeButton(label: string): HTMLButtonElement {
    const button = Array.from(
        host.querySelectorAll<HTMLButtonElement>(".timeframe-btn"),
    ).find((candidate) => candidate.textContent?.trim() === label);
    if (!button) throw new Error(`no timeframe button "${label}"`);
    return button;
}

beforeEach(() => {
    settingsState.analysisTimeframes = ["1h"];
    localStorage.clear();
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host?.remove();
});

describe("BUG-0718 — the last timeframe says why it stays", () => {
    it("marks the last selected timeframe unavailable and names the reason", () => {
        render();

        const button = timeframeButton("1h");
        const hint = lookup("settings.calculation.lastTimeframeHint");

        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-describedby")).toBe(
            "timeframe-minimum-hint",
        );
        expect(host.textContent).toContain(hint);
        // Reachable, so the reason can be reached with it.
        expect(button.disabled).toBe(false);
    });

    it("keeps the last timeframe when the control is pressed", () => {
        render();

        timeframeButton("1h").click();
        flushSync();

        expect(settingsState.analysisTimeframes).toEqual(["1h"]);
    });

    it("leaves other timeframes selectable and removable", () => {
        settingsState.analysisTimeframes = ["1h", "4h"];
        render();

        // Neither selected button is the last one yet.
        expect(timeframeButton("1h").getAttribute("aria-disabled")).toBeNull();
        expect(timeframeButton("4h").getAttribute("aria-disabled")).toBeNull();
        expect(host.textContent).not.toContain(
            lookup("settings.calculation.lastTimeframeHint"),
        );

        timeframeButton("4h").click();
        flushSync();

        expect(settingsState.analysisTimeframes).toEqual(["1h"]);
        // Now it is the last one, and the surface says so.
        expect(timeframeButton("1h").getAttribute("aria-disabled")).toBe("true");
        expect(host.textContent).toContain(
            lookup("settings.calculation.lastTimeframeHint"),
        );
    });
});
