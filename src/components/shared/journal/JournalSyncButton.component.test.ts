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
 * icon and resting label, which reads as broken. Each disable reason now has an
 * explicit visual state, and the blocking operation's own message is shown:
 * `isLoading` today covers a screenshot upload, so a generic "loading" sentence
 * would have named the wrong work.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";

/** Resolve a key against the shipped English dictionary, failing on a typo. */
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
    isBusy?: boolean;
    isLoading?: boolean;
    loadingMessage?: string;
    onSync?: () => void;
}) {
    component = mount(JournalSyncButton, {
        target: host,
        props: {
            isPro: props.isPro ?? true,
            isBusy: props.isBusy ?? false,
            isLoading: props.isLoading ?? false,
            loadingMessage: props.loadingMessage ?? "",
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
        expect(button.querySelector(".opacity-70 svg")).not.toBeNull();
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
        // A disabled button is outside the tab order, so the reason has to be
        // in the accessible name, not only in the hover title.
        expect(button.getAttribute("aria-label")).toContain(
            lookup("journal.syncRequiresPro"),
        );
    });

    it("shows a spinner and the syncing label while a fetch or sync runs", () => {
        const button = render({ isBusy: true });

        expect(button.disabled).toBe(true);
        expect(button.querySelector(".animate-spin")).not.toBeNull();
        expect(button.textContent).toContain(lookup("journal.messages.syncing"));
        expect(button.getAttribute("aria-label")).toBe(
            lookup("journal.messages.syncing"),
        );
    });

    it("shows the blocking operation's own message while it runs", () => {
        // The regression: this used to render the refresh icon and "Sync
        // Bitunix" while disabled, with no cue that work was in progress. The
        // message is the upload's, not a generic "loading": that is what the
        // producer actually set.
        const uploading = lookup("journal.messages.uploading");
        const button = render({ isLoading: true, loadingMessage: uploading });

        expect(button.disabled).toBe(true);
        expect(button.querySelector(".animate-spin")).not.toBeNull();
        expect(button.textContent).toContain(uploading);
        expect(button.textContent).not.toContain(lookup("journal.syncBitunix"));
        expect(button.getAttribute("aria-label")).toBe(uploading);
    });

    it("falls back to a generic loading label when no message is set", () => {
        const button = render({ isLoading: true, loadingMessage: "" });

        expect(button.textContent).toContain(lookup("journal.messages.loading"));
    });

    it("keeps a non-Pro button locked while other work runs", () => {
        const onSync = vi.fn();
        const button = render({
            isPro: false,
            isBusy: true,
            isLoading: true,
            loadingMessage: lookup("journal.messages.uploading"),
            onSync,
        });

        // The Pro gate is the honest reason: this account cannot sync at all.
        expect(button.disabled).toBe(true);
        expect(button.textContent).toContain("🔒");
        expect(button.textContent).toContain(lookup("journal.syncBitunix"));
        button.click();
        expect(onSync).not.toHaveBeenCalled();
    });
});
