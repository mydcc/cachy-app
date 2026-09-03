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
 * FEAT-0026 PR 0 — the credential store, with more than one account in it.
 *
 * Four pre-existing defects that FEAT-0026 amplifies but did not cause. Each
 * is invisible while there is exactly one account per venue and no way to
 * remove one, which is why they survived FEAT-0333's review. They are fixed
 * before the feature rather than inside it, so a reviewer reading a
 * multi-account diff is not simultaneously validating a crypto-lockout fix.
 *
 * What each defect cost, in one line:
 *   1. one corrupt blob locked the user out of *every* account
 *   2. an account holding nothing still produced ciphertext, which made a
 *      credential-free profile report itself as an encrypted one
 *   3. a removed account's ciphertext stayed in localStorage forever
 *   4. an account deleted in one tab came back in another, and that tab
 *      wrote it back to disk
 *
 * A fifth candidate was investigated and dropped: `accounts` binds to
 * `defaultSettings.accounts`, a module-level array, which looks like the
 * aliasing hazard `tradeFlowSettings` guards against with `structuredClone`
 * a few lines above it. It is not one. Measured against the unfixed code:
 * pushing onto one manager's list and then constructing a second on the
 * fresh-install path yields a clean `[bitunix, bitget]` — Svelte 5's
 * `$state()` proxy does not write the push back to the module-level array.
 * No defensive copy was added, because a fix whose comment describes a
 * hazard that cannot be reached is worse than no fix.
 *
 * Neighbouring suites, so this one stays a complement rather than a copy:
 * `settings.security.test.ts` owns encryption-at-rest (BUG-0280),
 * `settings.load.test.ts` owns load-shape tolerance and the failed decrypt of
 * *generic* secrets, `settings/secretsLoader.test.ts` owns `applyAccounts`
 * migration and the locked-state presentation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsManager } from "./settings.svelte";
import { cryptoService } from "../services/cryptoService";
import type { EncryptedBlob } from "../services/cryptoService";
import type { SwitchAuthorization } from "../lib/confirmationPolicy";

vi.mock("$app/environment", () => ({ browser: true }));

vi.mock("../services/cryptoService", () => ({
  cryptoService: {
    unlockSession: vi.fn().mockResolvedValue(true),
    lockSession: vi.fn(),
    isUnlocked: vi.fn().mockReturnValue(true),
    encrypt: vi.fn().mockResolvedValue({
      ciphertext: "encrypted",
      iv: "iv",
      salt: "salt",
      method: "AES-GCM",
    }),
    decrypt: vi
      .fn()
      .mockResolvedValue('{"key":"decrypted-key","secret":"decrypted-secret"}'),
    getOrGenerateDeviceKey: vi
      .fn()
      .mockResolvedValue({
        algorithm: { name: "PBKDF2" },
      } as unknown as CryptoKey),
  },
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

const STORAGE_KEY = "cryptoCalculatorSettings";

/**
 * A switch authorisation for the tests.
 *
 * Production code can only obtain one from `confirmationPolicyStore`, which
 * consults the policy first — that is the whole point of the type. These
 * tests are about what `setActiveAccount` does once authorised, not about
 * whether it was, so they mint one directly.
 */
const AUTH = { confirmedAt: null } as unknown as SwitchAuthorization;

const blob = (ciphertext: string): EncryptedBlob =>
  ({ ciphertext, iv: "i", salt: "s", method: "AES-GCM" }) as EncryptedBlob;

/** `save()` and `load()` are private; the suite drives them as the store does. */
const saveInternal = (mgr: SettingsManager) =>
  (mgr as unknown as { save(): Promise<void> }).save();
const loadInternal = (mgr: SettingsManager) =>
  (mgr as unknown as { load(): void }).load();

const storedPayload = () =>
  JSON.parse(localStorageMock.getItem(STORAGE_KEY)!) as {
    accounts?: { id: string }[];
    encryptedAccountKeys?: Record<string, unknown>;
  };

const bitunixRow = {
  id: "bitunix",
  name: "Bitunix",
  exchange: "bitunix",
  keys: { key: "", secret: "" },
};
const bitgetRow = {
  id: "bitget",
  name: "Bitget",
  exchange: "bitget",
  keys: { key: "", secret: "", passphrase: "" },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
});

describe("unlock() fails per account, not per profile", () => {
  /*
   * The defect: the per-account decrypt had no try/catch, while the
   * generic-secrets loop directly below it caught per key and counted. The
   * first unreadable blob rejected the shared `Promise.all`, the outer catch
   * called `lock()`, and `unlock()` returned false — a total-lockout
   * probability that grows with every account added.
   */
  beforeEach(() => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiProvider: "bitunix",
        isEncrypted: true,
        credentialSchemaVersion: 2,
        accounts: [bitunixRow, bitgetRow],
        activeAccountId: "bitunix",
        encryptedAccountKeys: {
          bitunix: blob("readable"),
          bitget: blob("corrupt"),
        },
      }),
    );

    vi.mocked(cryptoService.decrypt).mockImplementation(async (b: unknown) => {
      if ((b as EncryptedBlob).ciphertext === "corrupt") {
        throw new Error("OperationError");
      }
      return '{"key":"good-key","secret":"good-secret"}';
    });
  });

  it("unlocks the profile even though one account's blob is unreadable", async () => {
    const mgr = new SettingsManager();

    await expect(mgr.unlock("pw")).resolves.toBe(true);
    expect(mgr.isLocked).toBe(false);
  });

  it("restores the accounts whose blobs are readable", async () => {
    const mgr = new SettingsManager();
    await mgr.unlock("pw");

    expect(mgr.accountFor("bitunix").keys.key).toBe("good-key");
    expect(mgr.accountFor("bitunix").keys.secret).toBe("good-secret");
  });

  it("counts the unreadable one, and leaves that account empty rather than stale", async () => {
    const mgr = new SettingsManager();
    await mgr.unlock("pw");

    // `decryptionFailures` already has a surface in ConnectionsTab, so the
    // count needs no new string to become visible to the user.
    expect(mgr.decryptionFailures).toBe(1);
    expect(mgr.accountFor("bitget").keys.key).toBe("");
  });
});

describe("an account holding nothing produces no ciphertext", () => {
  /*
   * The defect: `setMasterPassword` encrypted every account unconditionally,
   * unlike the save path and unlike the generic-secrets loop beside it.
   * Ciphertext of `{"key":"","secret":""}` still makes
   * `Object.keys(encryptedAccountKeys).length > 0` true — and that
   * expression is the test for "is this an encrypted profile". A profile
   * holding no credentials reported itself as one that did.
   */
  it("writes a blob for the account with credentials and none for the empty one", async () => {
    const mgr = new SettingsManager();
    mgr.accountFor("bitunix").keys = { key: "bu-key", secret: "bu-secret" };
    // bitget is left exactly as the migration created it: empty.

    await mgr.setMasterPassword("pw");

    expect(mgr.encryptedAccountKeys?.bitunix).toBeDefined();
    expect(mgr.encryptedAccountKeys?.bitget).toBeUndefined();
  });

  it("leaves a profile with no credentials at all reporting no blobs", async () => {
    const mgr = new SettingsManager();

    await mgr.setMasterPassword("pw");

    expect(Object.keys(mgr.encryptedAccountKeys ?? {})).toHaveLength(0);
  });
});

describe("ciphertext for an account that no longer exists is pruned", () => {
  /*
   * The defect: `applyAccountKeyEncryption` iterated the live accounts only,
   * so an id present in storage but absent from that list was never visited
   * and never deleted — Class A material the user believes they removed,
   * kept indefinitely.
   */
  const withOrphan = () => {
    const mgr = new SettingsManager();
    mgr.accountFor("bitunix").keys = { key: "bu-key", secret: "bu-secret" };
    mgr.encryptedAccountKeys = {
      ...(mgr.encryptedAccountKeys ?? {}),
      "removed-account": blob("orphan"),
    };
    return mgr;
  };

  it("drops a blob whose account id is not in the live list", async () => {
    await saveInternal(withOrphan());

    expect(storedPayload().encryptedAccountKeys).not.toHaveProperty(
      "removed-account",
    );
  });

  it("keeps the blobs of accounts that do still exist", async () => {
    await saveInternal(withOrphan());

    // The prune must not become "erase everything I could not see".
    expect(storedPayload().encryptedAccountKeys).toHaveProperty("bitunix");
  });
});

describe("storage decides which accounts exist", () => {
  /*
   * The defect: the plaintext branch of `applyAccounts` started from the live
   * list and only ever added. With the cross-tab `storage` listener calling
   * `load()`, an account deleted in tab A survived in tab B — and tab B's
   * next autosave wrote it back, undoing the deletion for both.
   *
   * Only reachable for a user-created account: `migrateAccounts` runs first
   * and guarantees one account per *venue*, so a venue slug can never be
   * dropped by this path. That totality is exactly why the defect was
   * invisible before FEAT-0026 — until now every id in the list was a venue
   * slug.
   */
  it("drops a live account that storage no longer has", () => {
    const mgr = new SettingsManager();
    mgr.accounts = [
      ...mgr.accounts,
      {
        id: "user-made-2",
        name: "Second Bitunix",
        exchange: "bitunix",
        keys: { key: "k", secret: "s" },
      },
    ];

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiProvider: "bitunix",
        credentialSchemaVersion: 2,
        accounts: [bitunixRow, bitgetRow],
        activeAccountId: "bitunix",
      }),
    );

    loadInternal(mgr);

    expect(mgr.accounts.map((a) => a.id)).not.toContain("user-made-2");
  });

  it("keeps a venue with no account, rather than back-filling one", () => {
    const mgr = new SettingsManager();

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiProvider: "bitunix",
        credentialSchemaVersion: 2,
        accounts: [bitunixRow],
        activeAccountId: "bitunix",
      }),
    );

    loadInternal(mgr);

    // FEAT-0333 back-filled every venue, which was right while only the
    // migration could create accounts. FEAT-0026 lets a user remove one, and
    // back-filling would silently undo that on the next load — the two are
    // the same operation running in opposite directions.
    expect(mgr.accounts.map((a) => a.exchange)).not.toContain("bitget");
    expect(mgr.accounts).toHaveLength(1);
  });

  it("still gives a fresh install one account per venue", () => {
    // The conversion path is untouched: only the back-fill on the
    // already-converted branch was removed.
    const mgr = new SettingsManager();
    expect(mgr.accounts.map((a) => a.exchange).sort()).toEqual([
      "bitget",
      "bitunix",
    ]);
  });
});

/*
 * FEAT-0026 — adding, naming and removing accounts.
 *
 * The invariant these enforce replaced FEAT-0333's per-venue totality: not
 * "every venue has an account" but "at least one account exists". The change
 * is forced, because back-filling a missing venue and removing an account are
 * the same operation in opposite directions.
 */
describe("account management", () => {
  it("adds a second account on a venue that already has one", () => {
    const mgr = new SettingsManager();
    const created = mgr.addAccount("bitunix");

    expect(mgr.accounts.filter((a) => a.exchange === "bitunix")).toHaveLength(2);
    expect(created.id).not.toBe("bitunix");
  });

  it("names the second one distinguishably, since a switch list of two Bitunix is useless", () => {
    const mgr = new SettingsManager();
    expect(mgr.addAccount("bitunix").name).toBe("Bitunix 2");
    expect(mgr.addAccount("bitunix").name).toBe("Bitunix 3");
  });

  it("keeps existing account objects, so a bound credential input does not detach", () => {
    const mgr = new SettingsManager();
    const before = mgr.accounts[0];
    mgr.addAccount("bitunix");
    expect(mgr.accounts[0]).toBe(before);
  });

  it("gives the new account blank credentials shaped for its venue", () => {
    const mgr = new SettingsManager();
    const created = mgr.addAccount("bitget");
    expect(created.keys).toEqual({ key: "", secret: "", passphrase: "" });
  });

  it("renames in place, for the same binding reason", () => {
    const mgr = new SettingsManager();
    const target = mgr.accounts[0];

    expect(mgr.renameAccount(target.id, "  Scalping  ")).toBe(true);
    expect(mgr.accounts[0]).toBe(target);
    expect(target.name).toBe("Scalping");
  });

  it("refuses an empty name rather than storing one", () => {
    const mgr = new SettingsManager();
    const target = mgr.accounts[0];
    const original = target.name;

    expect(mgr.renameAccount(target.id, "   ")).toBe(false);
    expect(target.name).toBe(original);
  });

  it("removes an account and its stored ciphertext together", () => {
    const mgr = new SettingsManager();
    const extra = mgr.addAccount("bitunix");
    mgr.encryptedAccountKeys = {
      ...(mgr.encryptedAccountKeys ?? {}),
      [extra.id]: blob("secret"),
    };

    expect(mgr.removeAccount(extra.id)).toBe(true);
    expect(mgr.accounts.map((a) => a.id)).not.toContain(extra.id);
    // Class A material must not outlive the account the user deleted, even
    // if no save happens afterwards. Asserted through Object.keys rather than
    // toHaveProperty: encryptedAccountKeys is a $state proxy, and the
    // matcher does not see through it reliably.
    expect(Object.keys(mgr.encryptedAccountKeys ?? {})).not.toContain(extra.id);
  });

  it("refuses to remove the last account", () => {
    const mgr = new SettingsManager();
    while (mgr.accounts.length > 1) mgr.removeAccount(mgr.accounts[0].id);

    expect(mgr.accounts).toHaveLength(1);
    expect(mgr.removeAccount(mgr.accounts[0].id)).toBe(false);
    expect(mgr.accounts).toHaveLength(1);
  });

  it("never leaves the active id dangling when the active account is removed", () => {
    const mgr = new SettingsManager();
    const extra = mgr.addAccount("bitunix");
    mgr.setActiveAccount(extra.id, AUTH);

    mgr.removeAccount(extra.id);

    // A dangling active id makes every reader fall back to empty
    // credentials, which reads to a user as "my keys are gone".
    expect(mgr.accounts.some((a) => a.id === mgr.activeAccountId)).toBe(true);
  });

  it("moves the venue with the active account when that account is removed", () => {
    const mgr = new SettingsManager();
    const bitget = mgr.accounts.find((a) => a.exchange === "bitget")!;
    mgr.setActiveAccount(bitget.id, AUTH);
    expect(mgr.apiProvider).toBe("bitget");

    mgr.removeAccount(bitget.id);

    // `apiProvider` and `activeAccountId` are one fact under two names; a
    // removal that moved only one of them would resolve credentials for a
    // venue the active account is not on.
    expect(mgr.apiProvider).toBe(
      mgr.accounts.find((a) => a.id === mgr.activeAccountId)!.exchange,
    );
  });
});

describe("switching", () => {
  it("moves both the active id and the venue together", () => {
    const mgr = new SettingsManager();
    const bitget = mgr.accounts.find((a) => a.exchange === "bitget")!;

    expect(mgr.setActiveAccount(bitget.id, AUTH)).toBe(true);
    expect(mgr.activeAccountId).toBe(bitget.id);
    expect(mgr.apiProvider).toBe("bitget");
  });

  it("refuses an id that names no account, rather than storing a dangling one", () => {
    const mgr = new SettingsManager();
    const before = mgr.activeAccountId;

    expect(mgr.setActiveAccount("does-not-exist", AUTH)).toBe(false);
    expect(mgr.activeAccountId).toBe(before);
  });

  it("reports a no-op as no change, so a caller can skip the reconnect", () => {
    const mgr = new SettingsManager();
    expect(mgr.setActiveAccount(mgr.activeAccountId, AUTH)).toBe(false);
  });
});

