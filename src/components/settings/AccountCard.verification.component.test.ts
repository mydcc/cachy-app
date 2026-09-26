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
 * BUG-0560 — the credential card's status dot.
 *
 * The regression: three nonempty fields produced a green dot, so a revoked or
 * mistyped key looked exactly as healthy as a working one. The first test below
 * is that sentence as an assertion; the rest pin the states the dot is allowed
 * to take and the words a screen reader gets for each.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import { accountVerification, type VerificationSubject } from "../../stores/accountVerification.svelte";
import type { ExchangeAccount } from "../../stores/settings/accounts";

/**
 * The app's `_`, reduced to what this component uses: a lookup plus `{name}`
 * interpolation. Without the interpolation an assertion on a composed string
 * would only ever see the template.
 */
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

const KEYS = { key: "live-key-0001", secret: "live-secret-0001" };

function account(overrides: Partial<ExchangeAccount> = {}): ExchangeAccount {
    return {
        id: "acct-1",
        name: "Main",
        exchange: "bitunix",
        keys: { ...KEYS },
        ...overrides,
    };
}

function subjectFor(a: ExchangeAccount): VerificationSubject {
    return { id: a.id, exchange: a.exchange, keys: a.keys };
}

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    accountVerification.resetForTest();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

async function render(props: { account: ExchangeAccount; isActive?: boolean }) {
    // Replace, never stack: two mounted cards in one host would leave the
    // previous dot in the DOM for `dot()` to find, and the assertions would
    // read a component that is no longer the one under test.
    if (component) unmount(component as never);
    component = mount(AccountCard, { target: host, props }) as never;
    flushSync();
}

/** The dot is the element under test; its classes carry the state. */
function dot(): HTMLElement {
    const el = host.querySelector(".status-dot");
    if (!el) throw new Error("no status dot rendered");
    return el as HTMLElement;
}

describe("BUG-0560 — the credential card reports what the venue said", () => {
    it("is not green for nonempty credentials nobody has verified", async () => {
        const a = account();
        await render({ account: a });

        // AC1, as an assertion: this is the bug. Filled-in fields, no read, and
        // the dot must not claim the account works.
        expect(a.keys.key).not.toBe("");
        expect(a.keys.secret).not.toBe("");
        expect(dot().classList.contains("connected")).toBe(false);
    });

    it("is green only after a successful read", async () => {
        const a = account();
        accountVerification.recordSuccess(subjectFor(a));
        await render({ account: a });

        expect(dot().classList.contains("connected")).toBe(true);
    });

    it("shows a rejected credential as rejected, not as pending", async () => {
        const a = account();
        accountVerification.recordFailure(subjectFor(a), "rejected", "10001");
        await render({ account: a });

        expect(dot().classList.contains("rejected")).toBe(true);
        expect(dot().classList.contains("connected")).toBe(false);
        expect(dot().getAttribute("aria-label")).toContain("rejected");
    });

    it("words an unreachable venue differently from a refused key", async () => {
        const a = account();
        accountVerification.recordFailure(subjectFor(a), "unreachable");
        await render({ account: a });

        const label = dot().getAttribute("aria-label") ?? "";
        expect(label).toContain("unreachable");
        expect(label).not.toContain("Exchange rejected");
    });

    it("is pending while a read is in flight", async () => {
        const a = account();
        accountVerification.markVerifying(subjectFor(a));
        await render({ account: a });

        expect(dot().classList.contains("pending")).toBe(true);
        expect(dot().classList.contains("connected")).toBe(false);
    });

    it("returns to pending when a credential is edited under a verified verdict", async () => {
        const verified = account();
        accountVerification.recordSuccess(subjectFor(verified));
        await render({ account: verified });
        expect(dot().classList.contains("connected")).toBe(true);

        // The user edits the secret in the input. The verdict is about the old
        // one, so the card must stop claiming the account works before any
        // refetch has happened.
        await render({ account: account({ keys: { ...KEYS, secret: "rotated-secret-9" } }) });

        expect(dot().classList.contains("connected")).toBe(false);
    });

    it("does not show one account the verdict of another", async () => {
        accountVerification.recordSuccess(subjectFor(account({ id: "acct-1" })));
        await render({ account: account({ id: "acct-2" }) });

        expect(dot().classList.contains("connected")).toBe(false);
    });

    it("gives every state an accessible name", async () => {
        const a = account();
        accountVerification.recordFailure(subjectFor(a), "rejected", "10001");
        await render({ account: a });

        const label = dot().getAttribute("aria-label") ?? "";
        expect(label).toBeTruthy();
        // Not a dotted key path: the wording has to survive into the UI.
        expect(label).not.toContain("verifyStatus");
        expect(dot().getAttribute("role")).toBe("img");
    });

    it("shows no green for a Bitget account whose passphrase is missing", async () => {
        const a = account({
            exchange: "bitget",
            keys: { key: "live-key-0001", secret: "live-secret-0001" },
        });
        await render({ account: a });

        expect(dot().classList.contains("connected")).toBe(false);
    });
});
