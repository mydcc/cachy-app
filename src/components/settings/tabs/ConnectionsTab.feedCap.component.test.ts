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
 * by the handler, the counter and the hint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";

function lookup(key: string, values?: Record<string, unknown>): string {
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
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        template,
    );
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable(
            (key: string, options?: { values?: Record<string, unknown> }) =>
                lookup(key, options?.values),
        ),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import ConnectionsTab from "./ConnectionsTab.svelte";
import { settingsState } from "../../../stores/settings.svelte";
import { uiState } from "../../../stores/ui.svelte";

let host: HTMLDivElement;
let component: Record<string, unknown> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(ConnectionsTab, { target: host }) as never;
    flushSync();
}

function addButton(): HTMLButtonElement {
    const button = Array.from(host.querySelectorAll("button")).find(
        (candidate) =>
            candidate.textContent?.includes(lookup("settings.connections.addFeed")),
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
});

describe("BUG-0713 — the feed cap is on the surface, not only in the handler", () => {
    it("shows the count against a named cap before the limit is reached", () => {
        settingsState.customRssFeeds = ["https://a.example/rss"];
        render();

        const button = addButton();
        expect(button).toBeTruthy();
        expect(button.getAttribute("aria-disabled")).toBeNull();
        expect(bodyText()).toContain("1 / 5");
        expect(bodyText()).not.toContain(
            lookup("settings.connections.feedLimitReached", { max: 5 }),
        );
    });

    it("names the limit and keeps the control reachable at the cap", () => {
        settingsState.customRssFeeds = ["a", "b", "c", "d", "e"];
        render();

        const button = addButton();
        const hint = lookup("settings.connections.feedLimitReached", { max: 5 });

        // Visible without hover, and the accessible name carries it because the
        // control must stay in the tab order to be reached at all.
        expect(bodyText()).toContain(hint);
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("aria-label")).toBe(hint);
        expect(bodyText()).toContain("5 / 5");
    });

    it("does not add a sixth feed, and recovers when one is removed", () => {
        settingsState.customRssFeeds = ["a", "b", "c", "d", "e"];
        render();

        addButton().click();
        flushSync();
        expect(settingsState.customRssFeeds).toHaveLength(5);

        settingsState.customRssFeeds = ["a", "b", "c", "d"];
        flushSync();

        expect(addButton().getAttribute("aria-disabled")).toBeNull();
        expect(bodyText()).toContain("4 / 5");

        addButton().click();
        flushSync();
        expect(settingsState.customRssFeeds).toHaveLength(5);
    });
});
