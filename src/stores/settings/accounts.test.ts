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
