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
 * BUG-0719 — every reason the journal sync button is unavailable is visible.
 *
 * The button used to grey out on `uiState.isLoading` with its normal refresh
 * icon and label, which reads as broken. The component now has one explicit
 * visual state per disable reason; this enumerates them, so adding a fourth
 * condition to `disabled` without a state fails here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        ) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import JournalSyncButton from "./JournalSyncButton.svelte";

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

function render(props: {
    isPro?: boolean;
    isSyncing?: boolean;
    isLoading?: boolean;
    onSync?: () => void;
}) {
    component = mount(JournalSyncButton, {
        target: host,
        props: {
            isPro: props.isPro ?? true,
            isSyncing: props.isSyncing ?? false,
            isLoading: props.isLoading ?? false,
            onSync: props.onSync ?? vi.fn(),
        },
    });
    flushSync();
    return host.querySelector<HTMLButtonElement>("button")!;
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("BUG-0719 — the sync button names every reason it is unavailable", () => {
    it("offers the sync when the account is Pro and nothing is in flight", () => {
        const onSync = vi.fn();
        const button = render({ onSync });

        expect(button.disabled).toBe(false);
        expect(button.textContent).toContain(lookup("journal.syncBitunix"));
        expect(button.getAttribute("title")).toBe(
            lookup("journal.syncBitunix"),
        );
        // The refresh icon, not the spinner and not the lock.
        expect(button.querySelector(".animate-spin")).toBeNull();
        expect(button.textContent).not.toContain("🔒");

        button.click();
        expect(onSync).toHaveBeenCalledTimes(1);
    });

    it("shows the lock and the Pro reason for a non-Pro account", () => {
        const button = render({ isPro: false });

        expect(button.disabled).toBe(true);
        expect(button.textContent).toContain("🔒");
        expect(button.textContent).toContain(lookup("journal.syncBitunix"));
        expect(button.getAttribute("title")).toBe(
            lookup("journal.syncRequiresPro"),
        );
    });

    it("shows a spinner and the syncing label while a sync runs", () => {
        const button = render({ isSyncing: true });

        expect(button.disabled).toBe(true);
        expect(button.querySelector(".animate-spin")).not.toBeNull();
        expect(button.textContent).toContain(lookup("journal.messages.syncing"));
        // The accessible name follows the visible label, not the resting one.
        expect(button.getAttribute("aria-label")).toBe(
            lookup("journal.messages.syncing"),
        );
    });

    it("shows a spinner and a loading label while the journal loads", () => {
        // The regression: this used to render the refresh icon and "Sync
        // Bitunix" while disabled, with no cue that a load was in progress.
        const button = render({ isLoading: true });

        expect(button.disabled).toBe(true);
        expect(button.querySelector(".animate-spin")).not.toBeNull();
        expect(button.textContent).toContain(lookup("journal.messages.loading"));
        expect(button.textContent).not.toContain(lookup("journal.syncBitunix"));
        expect(button.getAttribute("aria-label")).toBe(
            lookup("journal.messages.loading"),
        );
    });

    it("keeps the button unavailable while the load and a sync overlap", () => {
        const onSync = vi.fn();
        const button = render({ isLoading: true, isSyncing: true, onSync });

        expect(button.disabled).toBe(true);
        // The in-flight sync is the more specific state.
        expect(button.textContent).toContain(lookup("journal.messages.syncing"));
        button.click();
        expect(onSync).not.toHaveBeenCalled();
    });
});
