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
 * FEAT-0346 — VisualsLayout wires the visuals settings to their stores. Each
 * control must write the store it is bound to; the component owns no state of
 * its own to drift from.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return { _: readable((key: string) => lookup(key) ?? key), locale: readable("en"), setLocale: vi.fn() };
});

const settingsMock = vi.hoisted(() => ({ newsOpenBehavior: "smart", showSidebars: false }));
vi.mock("../../../stores/settings.svelte", () => ({ settingsState: settingsMock }));

const uiMock = vi.hoisted(() => ({ showAssistant: false, toggleAssistant: vi.fn() }));
vi.mock("../../../stores/ui.svelte", () => ({ uiState: uiMock }));

import VisualsLayout from "./VisualsLayout.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.newsOpenBehavior = "smart";
    settingsMock.showSidebars = false;
    uiMock.showAssistant = false;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(VisualsLayout, { target: host }) as never;
    flushSync();
}

function buttonContaining(text: string): HTMLButtonElement {
    const el = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
        b.textContent?.includes(text),
    );
    if (!el) throw new Error(`button containing "${text}" not rendered`);
    return el;
}

describe("FEAT-0346 — VisualsLayout writes through to the stores", () => {
    it("records the chosen news open behaviour", () => {
        render();

        buttonContaining(lookup("settings.newsOpenBehaviorNewTab")).click();

        expect(settingsMock.newsOpenBehavior).toBe("new_tab");
    });

    it("binds the sidebars toggle to the settings store", () => {
        render();

        host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click();

        expect(settingsMock.showSidebars).toBe(true);
    });

    it("routes the assistant toggle through the ui store", () => {
        render();

        host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click();

        expect(uiMock.toggleAssistant).toHaveBeenCalledWith(true);
    });
});
