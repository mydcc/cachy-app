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

import { describe, it, expect } from "vitest";
import {
    migrateAccounts,
    keysForExchange,
    accountForExchange,
    migrateEncryptedAccountKeys,
    redactAccounts,
    defaultAccountState,
    activeAccountFor,
    keysForActiveAccount,
    newAccountId,
    LEGACY_ACCOUNT_IDS,
    type ExchangeAccount,
} from "./accounts";

const bitunixKeys = { key: "bu-key", secret: "bu-secret" };
const bitgetKeys = { key: "bg-key", secret: "bg-secret", passphrase: "bg-pass" };

const legacy = {
    apiKeys: { bitunix: bitunixKeys, bitget: bitgetKeys },
    apiProvider: "bitget" as const,
};

describe("migrateAccounts", () => {
    it("creates exactly one account per venue, named after it", () => {
        // Arrange / Act
        const { accounts } = migrateAccounts(legacy);

        // Assert
        expect(accounts).toHaveLength(2);
        expect(accounts.map((a) => a.exchange).sort()).toEqual(["bitget", "bitunix"]);
        expect(accounts.every((a) => a.name.length > 0)).toBe(true);
    });

    it("carries each venue's credentials to that venue's account and no other", () => {
        const { accounts } = migrateAccounts(legacy);

        expect(accountForExchange(accounts, "bitunix")?.keys).toEqual(bitunixKeys);
        expect(accountForExchange(accounts, "bitget")?.keys).toEqual(bitgetKeys);
    });

    it("makes the stored provider's account the active one", () => {
        const { accounts, activeAccountId } = migrateAccounts(legacy);

        const active = accounts.find((a) => a.id === activeAccountId);
        expect(active?.exchange).toBe("bitget");
    });

    it("is idempotent — migrating its own output changes nothing", () => {
        const once = migrateAccounts(legacy);
        const twice = migrateAccounts(legacy, once);

        expect(twice.accounts).toEqual(once.accounts);
        expect(twice.activeAccountId).toBe(once.activeAccountId);
    });

    it("never invents a second account for a venue on re-run", () => {
        const once = migrateAccounts(legacy);
        const twice = migrateAccounts(legacy, once);

        const bitunix = twice.accounts.filter((a) => a.exchange === "bitunix");
        expect(bitunix).toHaveLength(1);
    });

    it("gives a fresh install one empty account per venue rather than none", () => {
        // Today `apiKeys.bitunix` always exists, empty or not. Accounts must
        // stay total so no reader has to handle "no account yet".
        const { accounts } = migrateAccounts({
            apiKeys: {
                bitunix: { key: "", secret: "" },
                bitget: { key: "", secret: "" },
            },
            apiProvider: "bitunix",
        });

        expect(accounts).toHaveLength(2);
        expect(keysForExchange(accounts, "bitunix")).toEqual({ key: "", secret: "" });
    });

    it("repairs an active id that points at no account", () => {
        const once = migrateAccounts(legacy);
        const broken = { accounts: once.accounts, activeAccountId: "gone" };

        const repaired = migrateAccounts(legacy, broken);

        expect(repaired.accounts.some((a) => a.id === repaired.activeAccountId)).toBe(true);
    });

    it("keeps a user-renamed account's name on re-run", () => {
        const once = migrateAccounts(legacy);
        const renamed: ExchangeAccount[] = once.accounts.map((a) =>
            a.exchange === "bitunix" ? { ...a, name: "Scalping" } : a,
        );

        const after = migrateAccounts(legacy, { ...once, accounts: renamed });

        expect(accountForExchange(after.accounts, "bitunix")?.name).toBe("Scalping");
    });
});

describe("migrateEncryptedAccountKeys", () => {
    it("re-indexes each venue's blob under that venue's account id", () => {
        const result = migrateEncryptedAccountKeys({
            bitunix: "cipher-bu",
            bitget: "cipher-bg",
        } as never);

        expect(result[LEGACY_ACCOUNT_IDS.bitunix]).toBe("cipher-bu");
        expect(result[LEGACY_ACCOUNT_IDS.bitget]).toBe("cipher-bg");
    });

    it("does not invent a blob for a venue that had none", () => {
        const result = migrateEncryptedAccountKeys({ bitunix: "cipher-bu" } as never);

        expect(Object.keys(result)).toEqual([LEGACY_ACCOUNT_IDS.bitunix]);
    });

    it("returns an empty map for absent legacy ciphertext", () => {
        expect(migrateEncryptedAccountKeys(undefined)).toEqual({});
    });
});

describe("keysForExchange", () => {
    it("returns the venue's keys while one account per venue holds", () => {
        const { accounts } = migrateAccounts(legacy);

        expect(keysForExchange(accounts, "bitget")).toEqual(bitgetKeys);
    });

    it("returns empty credentials rather than undefined for an unknown venue", () => {
        expect(keysForExchange([], "bitunix")).toEqual({ key: "", secret: "" });
    });
});

describe("redactAccounts", () => {
    it("keeps identity and name so a rename survives persistence", () => {
        const accounts = migrateAccounts(legacy).accounts.map((a) =>
            a.exchange === "bitunix" ? { ...a, name: "Scalping" } : a,
        );

        const redacted = redactAccounts(accounts);

        expect(redacted.map((a) => a.id)).toEqual(accounts.map((a) => a.id));
        expect(accountForExchange(redacted, "bitunix")?.name).toBe("Scalping");
    });

    it("lets no credential material through, whatever it is handed", () => {
        const redacted = redactAccounts(migrateAccounts(legacy).accounts);

        const material = redacted.flatMap((a) => Object.values(a.keys));
        expect(material.every((v) => v === "")).toBe(true);
    });

    it("preserves bitget's passphrase slot so the stored shape does not drift", () => {
        const redacted = redactAccounts(migrateAccounts(legacy).accounts);

        expect(accountForExchange(redacted, "bitget")?.keys).toEqual({
            key: "",
            secret: "",
            passphrase: "",
        });
        expect(accountForExchange(redacted, "bitunix")?.keys).toEqual({
            key: "",
            secret: "",
        });
    });
});

describe("defaultAccountState", () => {
    it("gives a fresh profile one account per venue with an active one set", () => {
        const state = defaultAccountState();

        expect(state.accounts).toHaveLength(2);
        expect(state.accounts.some((a) => a.id === state.activeAccountId)).toBe(true);
    });
});

describe("keysForExchange defensiveness", () => {
    it("survives a missing account list, as the venue-indexed code did", () => {
        // A partially-initialised store must make a caller refuse to trade,
        // not throw at the call site that was about to place an order.
        expect(keysForExchange(undefined, "bitunix")).toEqual({ key: "", secret: "" });
        expect(accountForExchange(undefined, "bitget")).toBeUndefined();
    });
});

/**
 * FEAT-0026. `accountForExchange` answers "which account is on this venue";
 * these answer "which account is active", which used to be the same question
 * only because there was exactly one account per venue.
 */
describe("activeAccountFor", () => {
    const twoOnOneVenue: ExchangeAccount[] = [
        { id: "bu-1", name: "First", exchange: "bitunix", keys: { key: "k1", secret: "s1" } },
        { id: "bu-2", name: "Second", exchange: "bitunix", keys: { key: "k2", secret: "s2" } },
        { id: "bg-1", name: "Bitget", exchange: "bitget", keys: { key: "k3", secret: "s3" } },
    ];

    it("resolves the active account rather than the venue's first", () => {
        // The defect this whole item exists to prevent: with `accountForExchange`
        // the second account on a venue is unreachable, so an order signs with
        // the first while the screen names the second.
        expect(activeAccountFor(twoOnOneVenue, "bu-2", "bitunix")?.id).toBe("bu-2");
        expect(keysForActiveAccount(twoOnOneVenue, "bu-2", "bitunix").key).toBe("k2");
    });

    it("never returns an account from a different venue than the one being signed for", () => {
        // Active is a Bitunix account, but the caller is signing for Bitget.
        // Returning the active one would sign a Bitget request with Bitunix
        // credentials — a loud failure at the exchange, but still wrong.
        expect(activeAccountFor(twoOnOneVenue, "bu-2", "bitget")?.exchange).toBe("bitget");
    });

    /*
     * The fallback that keeps roughly thirty fixture files compiling: every
     * test that mocks `settingsState` without an `activeAccountId` still
     * resolves the venue's account. Pinned deliberately — if this ever
     * becomes a throw, the breakage is wide and silent to `npm run check`,
     * which excludes `src/**‍/*.test.ts`.
     */
    it("falls back to the venue's account when the active id names one elsewhere", () => {
        expect(activeAccountFor(twoOnOneVenue, "bg-1", "bitunix")?.id).toBe("bu-1");
    });

    it("falls back to the venue's account when the active id names nothing", () => {
        expect(activeAccountFor(twoOnOneVenue, "does-not-exist", "bitunix")?.id).toBe("bu-1");
        expect(activeAccountFor(twoOnOneVenue, "", "bitunix")?.id).toBe("bu-1");
        expect(activeAccountFor(twoOnOneVenue, undefined, "bitunix")?.id).toBe("bu-1");
    });

    it("is a no-op for a profile with one account per venue", () => {
        // Every profile that exists today. `activeAccountFor` must agree with
        // `accountForExchange` on all of them, or this PR is not the no-op it
        // claims to be.
        const { accounts, activeAccountId } = defaultAccountState();
        for (const venue of ["bitunix", "bitget"] as const) {
            expect(activeAccountFor(accounts, activeAccountId, venue)).toBe(
                accountForExchange(accounts, venue),
            );
        }
    });

    it("stays total, so an order-placing reader refuses rather than throws", () => {
        expect(keysForActiveAccount(undefined, "bu-1", "bitunix")).toEqual({
            key: "",
            secret: "",
        });
    });
});

describe("newAccountId", () => {
    it("never collides with the two reserved venue slugs", () => {
        const id = newAccountId([]);
        expect(Object.values(LEGACY_ACCOUNT_IDS)).not.toContain(id);
    });

    it("never collides with an existing account", () => {
        const { accounts } = defaultAccountState();
        const id = newAccountId(accounts);
        expect(accounts.map((a) => a.id)).not.toContain(id);
    });
});
