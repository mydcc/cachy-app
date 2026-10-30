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
 * BUG-0713 — the custom-feed cap has to be visible before it refuses.
 *
 * The add button used to stop responding at five feeds with no counter, no
 * hint and no tooltip, so it read as broken. The cap is now one constant read
 * by the handler, the counter and the hint, and the control stays focusable so
 * the reason is not hover-only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";

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
 * whose placeholders it cannot fill. A mock that left `{max}` in place would
 * make an assertion about the copy vacuous — and would hide a message that
 * names a different variable than the component passes.
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

vi.mock("../../../locales/i18n", async () => {
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

import ConnectionsTab from "./ConnectionsTab.svelte";
import { settingsState } from "../../../stores/settings.svelte";
import { uiState } from "../../../stores/ui.svelte";

/* Captured before any test mutates the real singletons, restored afterwards. */
const ORIGINAL_FEEDS = settingsState.customRssFeeds;
const ORIGINAL_SUBTAB = uiState.settingsConnectionsSubTab;

const FIVE_FEEDS = ["a", "b", "c", "d", "e"];

let host: HTMLDivElement;
let component: Record<string, unknown> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(ConnectionsTab, { target: host }) as never;
    flushSync();
}

/** The add control, anchored on its full label rather than a substring. */
function addButton(): HTMLButtonElement {
    const label = `+ ${t("settings.connections.addFeed")}`;
    const button = Array.from(
        host.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
        (candidate) =>
            candidate.textContent?.replace(/\s+/g, " ").trim() === label,
    );
    if (!button) throw new Error("no add-feed button rendered");
    return button;
}

function bodyText(): string {
    return host.textContent ?? "";
}

beforeEach(() => {
    uiState.settingsConnectionsSubTab = "rss";
    settingsState.customRssFeeds = [];
    localStorage.clear();
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host?.remove();

    // `localStorage.clear()` does not reset the live stores; leaving them
    // mutated would make a later file depend on this one's leftovers.
    settingsState.customRssFeeds = ORIGINAL_FEEDS;
    uiState.settingsConnectionsSubTab = ORIGINAL_SUBTAB;
});

describe("BUG-0713 — the feed cap is on the surface, not only in the handler", () => {
    it("shows the count against a named cap before the limit is reached", () => {
        settingsState.customRssFeeds = ["https://a.example/rss"];
        render();

        expect(bodyText()).toContain("1 / 5");
        expect(addButton().getAttribute("aria-disabled")).toBeNull();
        expect(bodyText()).not.toContain(
            t("settings.connections.feedLimitReached", { max: 5 }),
        );
    });

    it("names the limit on a control that stays focusable", () => {
        settingsState.customRssFeeds = FIVE_FEEDS;
        render();

        const button = addButton();
        const hint = t("settings.connections.feedLimitReached", { max: 5 });

        // Visible without hover, and the accessible name carries both the
        // action and the reason: replacing the name with the reason alone
        // would drop the label a voice-control user targets.
        expect(bodyText()).toContain(hint);
        expect(bodyText()).toContain("5 / 5");
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe(
            `${t("settings.connections.addFeed")} — ${hint}`,
        );

        // `aria-disabled`, not native `disabled`: the reason has to be
        // reachable by keyboard, which a disabled control is not.
        expect(button.disabled).toBe(false);
        button.focus();
        expect(document.activeElement).toBe(button);
    });

    it("refuses a sixth feed and recovers when one is removed", () => {
        settingsState.customRssFeeds = FIVE_FEEDS;
        render();

        addButton().click();
        flushSync();
        expect(settingsState.customRssFeeds).toHaveLength(5);

        settingsState.customRssFeeds = FIVE_FEEDS.slice(0, 4);
        flushSync();

        expect(addButton().getAttribute("aria-disabled")).toBeNull();
        expect(bodyText()).toContain("4 / 5");

        addButton().click();
        flushSync();
        expect(settingsState.customRssFeeds).toHaveLength(5);
    });
});
