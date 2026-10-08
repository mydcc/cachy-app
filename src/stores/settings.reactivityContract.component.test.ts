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
      return current + 1;
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
 * manager. `toJSON()` reads these through that collaborator
 * (`settings.svelte.ts:1978` and `:2093`), so the autosave effect tracks them
 * perfectly well — a write to `settings.isPro` would not, because
 * `SettingsManager` has no such field: it would create an inert own property
 * and the assertion would report a defect that does not exist.
 *
 * ` EntitlementStore` holds both as `$state`
 * (`src/stores/entitlement.svelte.ts:34-35`), and the load merge assigns through
 * the same accessor (`settings.svelte.ts:1586`, `:1757`).
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

  it("routes every key the manager does not hold through a declared owner", () => {
    const unmapped = SETTINGS_KEYS.filter(
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
    // So the loop above cannot pass because the key list was empty.
    expect(SETTINGS_KEYS.length).toBe(167);
  });
});