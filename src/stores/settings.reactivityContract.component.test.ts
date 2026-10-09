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

/**
 * The runtime half of the settings persistence contract.
 *
 * `settings.persistenceContract.test.ts` compares key *names*. It cannot see
 * which field a `toJSON()` entry reads, and it cannot see whether the backing
 * store is reactive. Both blind spots were demonstrated by mutation against that
 * guard and are recorded in BUG-0653.
 *
 * This file speaks the language the bug is actually written in: the autosave
 * `$effect` in `SettingsManager`'s constructor subscribes to exactly the
 * reactive reads that `toJSON()` makes. So for every key the store serializes,
 * write the field and observe that a save was scheduled. Two defects go red:
 *
 * - `showSidebars: this.showTooltips` in `toJSON()` — flipping `showSidebars`
 *   changes nothing the effect reads, so no save is scheduled.
 * - a `$state` declaration replaced by a plain field — the effect never
 *   subscribes, so again no save.
 *
 * Both are silent-data-loss bugs: the user toggles a setting, the app writes
 * nothing, and the change is gone on reload.
 *
 * **This must be a `.component.test.ts`.** Not a naming preference. Only the
 * `components` Vitest project sets `resolve.conditions: ["browser"]`
 * (`vite.config.ts:209`); the `unit` project resolves `svelte` to the server
 * entry, where `$effect` is inert. Written as a plain `.test.ts`, every key
 * reports as having scheduled no save — not because the store is broken but
 * because the effect never ran. Measured, not assumed: `toJSON` call count after
 * writing `showSidebars` was 0 in `unit` and 1 here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushSync } from "svelte";
import { SettingsManager, SETTINGS_KEYS } from "./settings.svelte";

vi.mock("$app/env", () => ({
  browser: true,
}));

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
    decrypt: vi.fn().mockResolvedValue("decrypted-value"),
    getOrGenerateDeviceKey: vi
      .fn()
      .mockResolvedValue({ algorithm: { name: "PBKDF2" } } as unknown as CryptoKey),
  },
}));

/**
 * The broker migration is a one-shot that forces `apiProvider` on the first
 * load. Left unset it dirties the autosave effect during construction, and the
 * test would start from a store that already had a pending save.
 */
const MIGRATION_KEY = "cachy_v0.94_broker_migrated_v2";

/** `setTimeout(..., 500)` in the autosave effect, `settings.svelte.ts:1080`. */
const AUTOSAVE_DEBOUNCE_MS = 500;

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

/**
 * A value guaranteed to differ from `current`, so the assignment registers as a
 * change. Svelte 5 does not re-run an effect when a `$state` field is written
 * its current value, so the test needs a real difference.
 *
 * The result is deliberately not type-valid for the field it lands on. That is
 * safe here and nowhere else: between the write and the assertion the only
 * observer is the autosave effect, which reads every field into `toJSON()` and
 * hands the result to `save()` — and `save()` is stubbed for the duration. The
 * original value is restored straight after, so the next key starts clean. A
 * per-field valid-value table for 167 heterogeneous fields would be a
 * maintenance trap larger than the defect it guards.
 */
function differentValue(current: unknown): unknown {
  switch (typeof current) {
    case "boolean":
      return !current;
    case "number":
      // Non-finite values never change by arithmetic: Infinity + 1 is still
      // Infinity, and NaN never differs from itself, so neither would register
      // as a write. No default is non-finite today; this is the guard refusing
      // a known false-positive shape rather than a live case.
      return Number.isFinite(current) ? current + 1 : 0;
    case "string":
      return `${current} `;
    case "undefined":
      return null;
    default:
      // Objects and arrays: a fresh reference is always a change.
      if (current === null) return undefined;
      return Array.isArray(current) ? [] : {};
  }
}

type Mutable = Record<string, unknown> & { save: () => unknown };

/**
 * Serialized keys whose field lives on a collaborator rather than on the
 * manager. `toJSON()` reads these through that collaborator — the `isPro` and
 * `isProLicenseActive` entries read `this.entitlement` — so the autosave effect
 * tracks them perfectly well. A write to `settings.isPro` would not, because
 * `SettingsManager` has no such field: it would create an inert own property
 * and the assertion would report a defect that does not exist.
 *
 * `EntitlementStore` holds both as `$state`
 * (`src/stores/entitlement.svelte.ts:34-35`), and the load merge assigns through
 * the same accessor. Line numbers for the `toJSON()` entries are deliberately
 * not pinned here: they already drifted once when the load-merge fix added nine
 * lines above them.
 *
 * The next test asserts this map covers every key the manager does not have, so
 * a third such key fails loudly instead of being reported as inert.
 */
const HELD_ELSEWHERE: Readonly<
  Record<string, (settings: SettingsManager) => Record<string, unknown>>
> = {
  isPro: (settings) => settings.entitlement as unknown as Record<string, unknown>,
  isProLicenseActive: (settings) =>
    settings.entitlement as unknown as Record<string, unknown>,
};

function ownerOf(
  settings: SettingsManager,
  key: string,
): Record<string, unknown> {
  const holder = HELD_ELSEWHERE[key];
  return holder ? holder(settings) : (settings as unknown as Record<string, unknown>);
}

describe("settings reactivity contract", () => {
  let settings: SettingsManager;
  let saveSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem(MIGRATION_KEY, "true");
    vi.useFakeTimers();

    settings = new SettingsManager();
    // Construction already runs the effect once and schedules a save. Let that
    // one land, so the spy below only sees saves caused by the test's own writes.
    flushSync();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    saveSpy = vi.spyOn(settings as unknown as Mutable, "save").mockReturnValue(
      undefined as unknown as void,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a save when any single serialized field is written", () => {
    const inert: string[] = [];

    for (const key of SETTINGS_KEYS) {
      const owner = ownerOf(settings, key);
      const before = owner[key];
      saveSpy.mockClear();

      owner[key] = differentValue(before);
      flushSync();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

      if (saveSpy.mock.calls.length === 0) inert.push(key);

      // Restore, then let that save land too. Leaving the restore's timer
      // pending would make the *next* iteration's advance fire it, and the
      // spy would credit this key with a save its own write never caused.
      owner[key] = before;
      flushSync();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    }

    // Reported as one list rather than a per-field `expect`, so a regression
    // names every key it broke instead of only the first.
    expect(
      inert,
      `writing these settings scheduled no save, so the change would be lost on ` +
        `reload: ${inert.join(", ")}`,
    ).toEqual([]);
  });

  it("schedules a save for in-place mutations through delegated getters", () => {
    // The reassignment loop above passes even through a copying getter (the
    // setter still fires and saves). In-place edits (`arr.push`, `obj.k =
    // v`) are the class a copy breaks: the live state never changes, the
    // effect reads nothing new, and the edit is gone on reload. This test
    // proves the delegating getters hand out the live `$state` proxy, for
    // every object-valued field — the facade PRs made copying getters
    // possible for the first time, so this guard starts with them.
    const inert: string[] = [];

    for (const key of SETTINGS_KEYS) {
      const owner = ownerOf(settings, key);
      const current: unknown = owner[key];
      if (typeof current !== "object" || current === null) continue;
      saveSpy.mockClear();

      if (Array.isArray(current)) {
        current.push("__sentinel__");
      } else {
        (current as Record<string, unknown>).__sentinel__ = true;
      }
      flushSync();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

      if (saveSpy.mock.calls.length === 0) inert.push(key);

      // Restore in place, then let that save land too (same timer hygiene
      // as the reassignment loop above).
      if (Array.isArray(current)) {
        current.pop();
      } else {
        delete (current as Record<string, unknown>).__sentinel__;
      }
      flushSync();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    }

    expect(
      inert,
      `in-place edits to these settings scheduled no save — the getter ` +
        `may be handing out a copy instead of live state: ${inert.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps scheduling saves when toJSON is memoised", () => {
    // ADR-0024 decision 1: the autosave effect must not depend on
    // `toJSON()`. A memoised serializer returns a cached object without
    // reading any field — under the old `this.toJSON()` tracking that
    // silently un-saved every write, with no test going red. Stub the
    // serializer and prove a write still schedules a save.
    //
    // One write is not enough to prove it: the effect subscribed to every
    // field during construction, so the first write after memoising still
    // fires from that stale subscription (and the run itself unsubscribes
    // everything, since the mock reads nothing). The burn-in cycle below
    // spends that subscription first — only the measured write counts.
    const cached = settings.toJSON();
    vi.spyOn(settings, "toJSON").mockReturnValue(cached);

    const owner = ownerOf(settings, "showSidebars");
    const before = owner["showSidebars"];
    owner["showSidebars"] = differentValue(before);
    flushSync();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    owner["showSidebars"] = before;
    flushSync();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    saveSpy.mockClear();

    owner["showSidebars"] = differentValue(before);
    flushSync();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

    expect(
      saveSpy,
      "a memoised toJSON must not un-save the store: tracking reads " +
        "go through the declared list, not the serializer",
    ).toHaveBeenCalled();

    owner["showSidebars"] = before;
    flushSync();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
  });

  it("schedules a save when an encrypted credential blob is written", () => {
    // The per-field loop above iterates `SETTINGS_KEYS` (user settings) only.
    // The encrypted blob rows are live reactive writes whose save-scheduling
    // was proven solely by the stub-fed `tracking.test.ts` — which cannot
    // observe a real `$state` subscription failure. These are the rows where
    // a missed save costs credentials, so they get the real effect.
    //
    // Deliberately untracked and NOT covered here: `credentialSchemaVersion`
    // (a constant — `saveCustomValue` never reads the manager) and
    // `isEncrypted` (written by `applyAccounts` on load, never by the user;
    // no write means no save to miss).
    const blobs = [
      "encryptedAccountKeys",
      "encryptedSecrets",
      "encryptedProviderConfigs",
    ] as const;
    const inert: string[] = [];

    for (const key of blobs) {
      const owner = settings as unknown as Record<string, unknown>;
      const before = owner[key];
      saveSpy.mockClear();

      owner[key] = differentValue(before);
      flushSync();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

      if (saveSpy.mock.calls.length === 0) inert.push(key);

      owner[key] = before;
      flushSync();
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    }

    expect(
      inert,
      `writing these credential blobs scheduled no save: ${inert.join(", ")}`,
    ).toEqual([]);
  });

  it("routes every key the manager does not hold through a declared owner", () => {
    const unmapped = SETTINGS_KEYS.filter(
      // `in`, not hasOwn: $state class fields live on the prototype, so an
      // own-property check would report every key as unmapped.
      (key) => !(key in settings) && !(key in HELD_ELSEWHERE),
    );
    // Without this, a key that moved to another object would be written on the
    // manager, land as an inert own property, and be reported above as a
    // reactivity defect rather than as the mapping gap it is.
    expect(unmapped, `add these to HELD_ELSEWHERE: ${unmapped.join(", ")}`).toEqual(
      [],
    );
  });

  it("covers the fields the store serializes", () => {
    // So the loop above cannot pass because the key list was empty. Deliberately
    // not pinned to the current count: the exact number lives in BUG-0653 as a
    // measurement, and an assertion on it would break on every added setting.
    expect(SETTINGS_KEYS.length).toBeGreaterThan(0);
  });
});