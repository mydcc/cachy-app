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
 *
 * Named exchange accounts — FEAT-0333.
 *
 * Credentials used to be indexed by venue, one slot each:
 *
 *     apiKeys: { bitunix: ApiKeys; bitget: ApiKeys }
 *
 * which is why a trader cannot run two accounts on one exchange. This module
 * owns the shape that replaces it and the migration into it. It changes
 * nothing a user can see: the migration produces exactly one account per
 * venue, and `keysForExchange` returns for that venue what `apiKeys.<venue>`
 * returned before. The second account, the switch and the UI are FEAT-0026.
 *
 * This module is pure: no I/O, no store reads, no Svelte runes, so the
 * migration can be tested against real stored shapes without a DOM.
 *
 * Totality is deliberate
 * ----------------------
 * Every known venue always gets an account, even one with empty credentials,
 * because `apiKeys.bitunix` always existed too. Readers therefore never have
 * to answer "what if no account exists yet" — a question that has no good
 * answer at an order-placing call site.
 */

import type { ApiKeys } from "../settings.svelte";
import type { EncryptedBlob } from "../../services/cryptoService";

/**
 * The credential shape this build writes and understands.
 *
 * 1 was the venue-indexed `apiKeys` block; 2 is this named-account list. A
 * backup carrying a higher number is refused by `validateSettings` rather
 * than partially restored — a settings section restored without its
 * credentials looks like a success and is not one.
 *
 * A build older than FEAT-0333 cannot be taught this, so it restores a
 * version-2 payload without credentials. That costs the user re-entering
 * their keys and costs them nothing at the exchange — the one part of the
 * compatibility story a forward-only change cannot fix.
 */
export const CREDENTIAL_SCHEMA_VERSION = 2;

export type ExchangeProvider = "bitunix" | "bitget";

/** Every venue that gets an account. Order fixes the migration's output. */
export const EXCHANGES: readonly ExchangeProvider[] = ["bitunix", "bitget"];

/**
 * Account ids for the accounts the migration creates.
 *
 * Deliberately the venue slug rather than a generated id: the migration has to
 * be idempotent against storage it may have already converted, and a
 * deterministic id makes "have I migrated this venue?" a lookup rather than a
 * heuristic. Accounts added later by the user get generated ids, which cannot
 * collide with these because these are exactly the two reserved words.
 */
export const LEGACY_ACCOUNT_IDS = {
    bitunix: "bitunix",
    bitget: "bitget",
} as const satisfies Record<ExchangeProvider, string>;

/** What the migration names an account it created. */
const DEFAULT_NAMES = {
    bitunix: "Bitunix",
    bitget: "Bitget",
} as const satisfies Record<ExchangeProvider, string>;

/** The name a freshly created account for this venue carries. */
export function defaultAccountName(exchange: ExchangeProvider): string {
    return DEFAULT_NAMES[exchange];
}

export interface ExchangeAccount {
    /** Stable identity. Never reused, never rewritten by a migration. */
    id: string;
    /** User-facing label. FEAT-0026 lets a user change it; migration does not. */
    name: string;
    exchange: ExchangeProvider;
    keys: ApiKeys;
}

export interface AccountState {
    accounts: ExchangeAccount[];
    activeAccountId: string;
}

/** The credential fields as they were stored before FEAT-0333. */
export interface LegacyCredentialShape {
    apiKeys?: Partial<Record<ExchangeProvider, ApiKeys>>;
    encryptedApiKeys?: Partial<Record<ExchangeProvider, EncryptedBlob>>;
    apiProvider?: unknown;
}

/**
 * An empty credential set shaped for its venue.
 *
 * Bitget carries a passphrase and Bitunix does not, and the difference has to
 * survive blanking: a redacted Bitget account that loses its `passphrase` key
 * changes the persisted shape, which is the kind of drift a restore notices
 * long after the change that caused it.
 */
export function blankKeysFor(exchange: ExchangeProvider): ApiKeys {
    return exchange === "bitget"
        ? { key: "", secret: "", passphrase: "" }
        : { key: "", secret: "" };
}

const emptyKeys = (): ApiKeys => ({ key: "", secret: "" });

/**
 * The account state a profile starts with: one empty account per venue.
 *
 * Built through the migration rather than written out, so a fresh install and
 * a migrated one cannot drift apart — there is one definition of "what
 * accounts look like" and both paths go through it.
 */
export function defaultAccountState(): AccountState {
    return migrateAccounts({
        apiKeys: {
            bitunix: blankKeysFor("bitunix"),
            bitget: blankKeysFor("bitget"),
        },
        apiProvider: "bitunix",
    });
}

export function accountForExchange(
    accounts: readonly ExchangeAccount[] | undefined | null,
    exchange: ExchangeProvider,
): ExchangeAccount | undefined {
    return accounts?.find((account) => account.exchange === exchange);
}

/**
 * The venue's credentials, as `apiKeys.<venue>` used to give them.
 *
 * This is the accessor every reader goes through, so that "which account is
 * active" becomes one decision in one place when FEAT-0026 makes it a real
 * question. Total by design — see the module note.
 *
 * It tolerates a missing list because the venue-indexed code it replaced was
 * equally defensive (`apiKeys?.bitget?.key`). At an order-placing call site,
 * empty credentials make the caller refuse to trade; a thrown `undefined.find`
 * would take the surface down instead. Refusing is the better failure.
 */
export function keysForExchange(
    accounts: readonly ExchangeAccount[] | undefined | null,
    exchange: ExchangeProvider,
): ApiKeys {
    return accountForExchange(accounts, exchange)?.keys ?? emptyKeys();
}

/**
 * Convert stored credentials into accounts, or reconcile accounts that are
 * already converted.
 *
 * Idempotent: given its own output it returns an equal value. It never drops
 * an account, never moves credentials between venues, and never renames an
 * account a user has renamed — the only things it adds are a missing venue
 * and a repaired `activeAccountId`.
 */
export function migrateAccounts(
    legacy: LegacyCredentialShape,
    existing?: Partial<AccountState>,
): AccountState {
    const converted = existing?.accounts?.length
        ? [...existing.accounts]
        : accountsFromLegacy(legacy);

    // A venue with no account cannot be reached by any reader, so add it back
    // rather than letting the gap propagate to an order-placing surface.
    const accounts = EXCHANGES.reduce<ExchangeAccount[]>(
        (acc, exchange) =>
            accountForExchange(acc, exchange)
                ? acc
                : [...acc, accountFromLegacy(legacy, exchange)],
        converted,
    );

    return { accounts, activeAccountId: resolveActiveId(accounts, legacy, existing) };
}

function accountsFromLegacy(legacy: LegacyCredentialShape): ExchangeAccount[] {
    return EXCHANGES.map((exchange) => accountFromLegacy(legacy, exchange));
}

function accountFromLegacy(
    legacy: LegacyCredentialShape,
    exchange: ExchangeProvider,
): ExchangeAccount {
    return {
        id: LEGACY_ACCOUNT_IDS[exchange],
        name: DEFAULT_NAMES[exchange],
        exchange,
        keys: legacy.apiKeys?.[exchange] ?? emptyKeys(),
    };
}

/**
 * Which account is active.
 *
 * An id that points at no account is repaired rather than kept: a dangling
 * active id means every reader falls back to empty credentials, which reads to
 * a user as "my keys are gone".
 */
function resolveActiveId(
    accounts: readonly ExchangeAccount[],
    legacy: LegacyCredentialShape,
    existing?: Partial<AccountState>,
): string {
    const stored = existing?.activeAccountId;
    if (stored && accounts.some((account) => account.id === stored)) return stored;

    const fromProvider = accounts.find(
        (account) => account.exchange === legacy.apiProvider,
    );
    return (fromProvider ?? accounts[0])?.id ?? "";
}

/**
 * Re-index the encrypted credential blobs from venue keys onto account ids.
 *
 * The ciphertext is carried over untouched — nothing is decrypted or
 * re-encrypted here, so the migration needs no master password and cannot
 * fail on a locked profile.
 */
export function migrateEncryptedAccountKeys(
    legacyEncrypted: Partial<Record<ExchangeProvider, EncryptedBlob>> | undefined,
): Record<string, EncryptedBlob> {
    if (!legacyEncrypted) return {};

    return EXCHANGES.reduce<Record<string, EncryptedBlob>>((acc, exchange) => {
        const blob = legacyEncrypted[exchange];
        return blob ? { ...acc, [LEGACY_ACCOUNT_IDS[exchange]]: blob } : acc;
    }, {});
}

/**
 * Accounts with their credentials blanked, for the serialization that
 * `toJSON()` emits (BUG-0280).
 *
 * Unlike the venue-indexed `redactApiKeys` it replaced, this one has to *read*
 * its argument: `id`, `name` and `exchange` must survive, or a renamed account
 * loses its name on the next load. Only `keys` crosses the mapping, and it is
 * overwritten unconditionally — no credential material can pass through this
 * function regardless of what the caller hands it.
 */
export function redactAccounts(
    liveAccounts: readonly ExchangeAccount[],
): ExchangeAccount[] {
    return liveAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        exchange: account.exchange,
        keys: blankKeysFor(account.exchange),
    }));
}
