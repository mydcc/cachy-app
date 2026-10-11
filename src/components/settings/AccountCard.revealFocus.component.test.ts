// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * BUG-0670 — a revealed credential does not outlive the card's focus.
 *
 * The reveal toggle renders a key as plaintext. That used to be safe by
 * accident: opening anything swept the settings pane, which unmounted this
 * card and its `<input>`. BUG-0667 made the pane survive a modal on purpose,
 * so the plaintext now needs a rule of its own — and focus is it, because
 * focus is already the record of where the trader's attention is and knows
 * nothing about windows.
 *
 * The load-bearing pair is the middle two cases: leaving hides, staying
 * inside does not. A rule that hid on every `focusout` would pass the first
 * and fail the second, which is the regression this file exists to catch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import type { ExchangeAccount } from "../../stores/settings/accounts";

/** The app's `_`, reduced to what this component uses. */
function lookup(key: string, values?: Record<string, string | number>): string {
    const template = key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
    if (template === undefined) return key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in values ? String(values[name]) : whole,
    );
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string, opts?: { values?: Record<string, string | number> }) =>
            lookup(key, opts?.values),
        ),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import AccountCard from "./AccountCard.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function account(): ExchangeAccount {
    return {
        id: "acct-1",
        name: "Main",
        exchange: "bitunix",
        keys: { key: "live-key-0001", secret: "live-secret-0001" },
    };
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(): void {
    component = mount(AccountCard, { target: host, props: { account: account() } }) as never;
    flushSync();
}

function field(part: "key" | "secret"): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>(`#account-acct-1-${part}`);
    if (!el) throw new Error(`no ${part} field rendered`);
    return el;
}

/** The reveal toggle, by document order: key, then secret. */
function revealButton(part: "key" | "secret"): HTMLButtonElement {
    const order = ["key", "secret"] as const;
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>(".toggle-btn"));
    const button = buttons[order.indexOf(part)];
    if (!button) throw new Error(`no reveal button for ${part}`);
    return button;
}

/**
 * Moves focus off the key field, onto `next` — or nowhere, when `null`.
 *
 * `focusout` is dispatched directly rather than by calling `.focus()`
 * elsewhere: happy-dom does not derive `relatedTarget` from a real focus
 * change, and the whole rule is decided by that value.
 */
function leaveKeyField(next: Node | null): void {
    const event = new FocusEvent("focusout", { bubbles: true });
    Object.defineProperty(event, "relatedTarget", { value: next });
    field("key").dispatchEvent(event);
    flushSync();
}

describe("AccountCard — a revealed key does not outlive the card's focus (BUG-0670)", () => {
    it("reveals the key when the toggle is clicked", () => {
        render();
        expect(field("key").type).toBe("password");

        revealButton("key").click();
        flushSync();

        expect(field("key").type).toBe("text");
    });

    it("hides it again when focus leaves the card", () => {
        render();
        revealButton("key").click();
        flushSync();
        expect(field("key").type).toBe("text");

        const outside = document.createElement("button");
        document.body.appendChild(outside);
        try {
            leaveKeyField(outside);
            expect(field("key").type).toBe("password");
        } finally {
            outside.remove();
        }
    });

    it("keeps it revealed while focus stays inside the card", () => {
        // Tabbing from a field to its own reveal button is not leaving.
        render();
        revealButton("key").click();
        flushSync();

        leaveKeyField(field("secret"));

        expect(field("key").type).toBe("text");
    });

    it("hides it when focus goes somewhere that cannot hold it", () => {
        // `relatedTarget === null`: the page background, another application.
        // From this card's point of view that is the same "gone" case.
        render();
        revealButton("key").click();
        flushSync();

        leaveKeyField(null);

        expect(field("key").type).toBe("password");
    });

    it("hides every revealed field, not only the one losing focus", () => {
        render();
        revealButton("key").click();
        revealButton("secret").click();
        flushSync();
        expect(field("secret").type).toBe("text");

        leaveKeyField(null);

        expect(field("key").type).toBe("password");
        expect(field("secret").type).toBe("password");
    });
});
