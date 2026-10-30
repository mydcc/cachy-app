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

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../locales/locales/en.json";

function message(key: string): string {
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

/**
 * The real `$(key, { values })` substitutes `{name}` and refuses a message
 * whose placeholders it cannot fill; `timeframesSelected` carries `{count}`,
 * so a mock that ignored `values` would render the raw placeholder.
 */
function t(key: string, values?: Record<string, unknown>): string {
    const template = message(key);
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
        if (!(name in values)) {
            throw new Error(`${key}: no value for {${name}}`);
        }
        return String(values[name]);
    });
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable(
            (key: string, options?: { values?: Record<string, unknown> }) =>
                t(key, options?.values),
        ),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import CalculationSettings from "./CalculationSettings.svelte";
import { settingsState } from "../../stores/settings.svelte";

/* Captured before any test mutates the real singleton, restored afterwards. */
const ORIGINAL_TIMEFRAMES = settingsState.analysisTimeframes;

const HINT = message("settings.calculation.lastTimeframeHint");

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

afterAll(() => {
    settingsState.analysisTimeframes = ORIGINAL_TIMEFRAMES;
});

describe("BUG-0718 — the last timeframe says why it stays", () => {
    it("marks only the last selected timeframe and points at its reason", () => {
        render();

        const button = timeframeButton("1h");
        const hintId = button.getAttribute("aria-describedby");

        expect(button.getAttribute("aria-disabled")).toBe("true");
        // The reference has to resolve, or the reason is never announced.
        expect(hintId).toBeTruthy();
        const hint = host.querySelector<HTMLElement>(`#${hintId}`);
        expect(hint).not.toBeNull();
        expect(hint?.textContent?.trim()).toBe(HINT);
        expect(host.textContent).toContain(HINT);

        // Reachable, so the reason can be read with the control.
        expect(button.disabled).toBe(false);
        button.focus();
        expect(document.activeElement).toBe(button);

        // Only the selected one: marking every button unavailable would also
        // "communicate" the limit, and it would be wrong.
        expect(timeframeButton("5m").getAttribute("aria-disabled")).toBeNull();
        expect(timeframeButton("5m").hasAttribute("aria-describedby")).toBe(
            false,
        );
    });

    it("keeps the last timeframe and keeps saying why after a press", () => {
        render();

        timeframeButton("1h").click();
        flushSync();

        expect(settingsState.analysisTimeframes).toEqual(["1h"]);
        // The handler guard alone already keeps the array; this is what the
        // fix adds, so the case would go red if the affordance were removed.
        expect(timeframeButton("1h").getAttribute("aria-disabled")).toBe(
            "true",
        );
        expect(host.textContent).toContain(HINT);
    });

    it("leaves the other timeframes available until one is left", () => {
        settingsState.analysisTimeframes = ["1h", "4h"];
        render();

        expect(timeframeButton("1h").getAttribute("aria-disabled")).toBeNull();
        expect(timeframeButton("4h").getAttribute("aria-disabled")).toBeNull();
        expect(host.textContent).not.toContain(HINT);

        timeframeButton("4h").click();
        flushSync();

        expect(settingsState.analysisTimeframes).toEqual(["1h"]);
        expect(timeframeButton("1h").getAttribute("aria-disabled")).toBe(
            "true",
        );
        expect(timeframeButton("5m").getAttribute("aria-disabled")).toBeNull();
        expect(host.textContent).toContain(HINT);
    });

    it("does not explain a minimum when the only stored value is not on screen", () => {
        // A legacy or hand-edited value the store accepts unvalidated: no
        // rendered button is selected, so a hint would explain nothing.
        settingsState.analysisTimeframes = ["2h"];
        render();

        expect(host.textContent).not.toContain(HINT);
        const marked = Array.from(
            host.querySelectorAll(".timeframe-btn"),
        ).filter((button) => button.getAttribute("aria-disabled") === "true");
        expect(marked).toHaveLength(0);
    });
});
