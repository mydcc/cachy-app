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
 * BUG-0716 — the header's two destructive controls ask before they act.
 *
 * The reset button replaced every trade-form value except symbol and trade
 * type on the first click; the delete button removed the selected preset from
 * localStorage. Both now go through `modalState` like every other destructive
 * action in the app, and both messages name what is lost.
 *
 * The cancel cases use the *real* action (no spy over `resetInputs` /
 * `deletePreset`), because a spy would make "the state is untouched" true no
 * matter what the handler does. They also wait for the handler to resume after
 * its `await` before asserting: `waitFor` only proves the dialog was asked, and
 * a gate that asks and then acts anyway is the one regression this file exists
 * to catch.
 *
 * The dialog's own "No" button is exercised through the real store in
 * `HeaderPresetActions.dialog.component.test.ts`; here `modalState` is mocked so
 * the component's branch is isolated.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../locales/locales/en.json";

function message(key: string, values?: Record<string, unknown>): string {
    const template = key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        );
    if (typeof template !== "string") {
        throw new Error(`missing i18n key: ${key}`);
    }
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in values ? String(values[name]) : whole,
    );
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable(
            (key: string, options?: { values?: Record<string, unknown> }) =>
                message(key, options?.values),
        ),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

vi.mock("../../stores/modal.svelte", () => ({
    modalState: { show: vi.fn() },
}));

import HeaderPresetActions from "./HeaderPresetActions.svelte";
import { modalState } from "../../stores/modal.svelte";
import { presetState } from "../../stores/preset.svelte";
import { tradeState } from "../../stores/trade.svelte";
import { app } from "../../services/app";
import { CONSTANTS } from "../../lib/constants";

const STORAGE_KEY = CONSTANTS.LOCAL_STORAGE_PRESETS_KEY;

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | null = null;

/** Lets the handler resume after `await modalState.show(...)`. */
function afterHandler() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(HeaderPresetActions, { target: host });
    flushSync();
}

function control(id: string): HTMLButtonElement {
    const element = host.querySelector<HTMLButtonElement>(`#${id}`);
    if (!element) throw new Error(`no #${id} rendered`);
    return element;
}

function storedPresetNames(): string[] {
    return Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
}

beforeEach(() => {
    localStorage.clear();
    presetState.selectedPreset = "";
    tradeState.entryPrice = "";
    vi.mocked(modalState.show).mockReset();
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host?.remove();
    vi.restoreAllMocks();
});

describe("BUG-0716 — the header confirms before it destroys", () => {
    it("asks before resetting and leaves every field when cancelled", async () => {
        tradeState.entryPrice = "123";
        vi.mocked(modalState.show).mockResolvedValue(false);

        render();
        control("reset-btn").click();

        await vi.waitFor(() => expect(modalState.show).toHaveBeenCalledTimes(1));
        await afterHandler();

        const [title, body, type] = vi.mocked(modalState.show).mock.calls[0];
        expect(title).toBe(message("dashboard.resetConfirmTitle"));
        expect(body).toBe(message("dashboard.resetConfirmMessage"));
        expect(type).toBe("confirm");

        // The real reset would clear this; nothing did.
        expect(tradeState.entryPrice).toBe("123");
    });

    it("asks before deleting and keeps the preset when cancelled", async () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ Mine: { entryPrice: "1" } }),
        );
        presetState.selectedPreset = "Mine";
        vi.mocked(modalState.show).mockResolvedValue(false);

        render();
        control("delete-preset-btn").click();

        await vi.waitFor(() => expect(modalState.show).toHaveBeenCalledTimes(1));
        await afterHandler();

        const [title, body, type] = vi.mocked(modalState.show).mock.calls[0];
        expect(title).toBe(message("dashboard.deletePresetConfirmTitle"));
        expect(body).toBe(
            message("dashboard.deletePresetConfirmMessage", { name: "Mine" }),
        );
        expect(body).toContain("Mine");
        expect(type).toBe("confirm");

        // The real delete writes localStorage; the preset is still there.
        expect(storedPresetNames()).toContain("Mine");
    });

    it("performs each action only after confirmation", async () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ Mine: { entryPrice: "1" } }),
        );
        presetState.selectedPreset = "Mine";
        const remove = vi.spyOn(app, "deletePreset").mockResolvedValue();
        const reset = vi
            .spyOn(tradeState, "resetInputs")
            .mockImplementation(() => {});
        vi.mocked(modalState.show).mockResolvedValue(true);

        render();
        control("delete-preset-btn").click();
        await vi.waitFor(() => expect(remove).toHaveBeenCalledWith("Mine"));

        control("reset-btn").click();
        await vi.waitFor(() => expect(reset).toHaveBeenCalledWith(true));
    });

    it("keeps delete unavailable until a preset is selected", () => {
        render();

        expect(control("delete-preset-btn").disabled).toBe(true);
        control("delete-preset-btn").click();
        expect(modalState.show).not.toHaveBeenCalled();

        presetState.selectedPreset = "Mine";
        flushSync();

        expect(control("delete-preset-btn").disabled).toBe(false);
    });
});
