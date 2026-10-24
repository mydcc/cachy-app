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

/**
 * BUG-0730 — `save()` used to return immediately when another save held the
 * lock. The autosave effect's call was then discarded; the change stayed in
 * the store and was written only if a later edit happened to schedule another
 * save. Closing the app in between lost it.
 *
 * The tests hold a save on a deferred encryption promise, change a setting
 * while it is in flight, and then make the call the autosave effect would
 * make. Each deferred gate is preceded by a `saveLock` assertion, so a test
 * that no longer reproduces the race fails instead of passing sequentially.
 *
 * Deliberately a plain `unit` test: the race lives in `save()`, so the test
 * calls it directly instead of depending on `$effect` timing. That also keeps
 * the failure attributable to the queue and not to the scheduler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SettingsManager } from "./settings.svelte";
import { CONSTANTS } from "../lib/constants";
import { StorageHelper } from "../utils/storageHelper";

vi.mock("$app/env", () => ({
  browser: true,
}));

vi.mock("../services/cryptoService", () => ({
  cryptoService: {
    unlockSession: vi.fn().mockResolvedValue(true),
    lockSession: vi.fn(),
    isUnlocked: vi.fn().mockReturnValue(true),
    // Deliberately constant: the unchanged-blob test needs a deterministic
    // ciphertext. Production encrypts the device-key canary with a fresh IV on
    // every save, so the "only if different" guard does not skip an encrypted
    // save; this mock is what makes that skip observable here.
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
 * A one-shot migration reads this key on load; left unset it dirties the
 * constructor's autosave effect.
 */
const MIGRATION_KEY = "cachy_v0.94_broker_migrated_v2";
const SETTINGS_KEY = CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY;

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

interface Loader {
  getDeviceKey: () => Promise<unknown>;
  applyFieldEncryption: (...args: unknown[]) => Promise<number>;
}

interface SaveInternals {
  save: () => Promise<void>;
  saveLock: boolean;
  savePending: boolean;
  secretsLoader: Loader;
}

function internals(settings: SettingsManager): SaveInternals {
  return settings as unknown as SaveInternals;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Settings-blob writes only; the migration key is not the subject. */
function writes(): number {
  return localStorageMock.setItem.mock.calls.filter(
    ([key]) => key === SETTINGS_KEY,
  ).length;
}

function stored(): Record<string, unknown> {
  const raw = localStorageMock.getItem(SETTINGS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function within(assertion: () => void): Promise<void> {
  await vi.waitFor(assertion, { timeout: 2_000, interval: 10 });
}

let manager: SettingsManager;

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  localStorageMock.setItem(MIGRATION_KEY, "true");
  manager = new SettingsManager();
  // Drop anything the constructor itself wrote; each test counts its own.
  localStorageMock.setItem.mockClear();
});

afterEach(() => {
  manager.destroy();
  vi.restoreAllMocks();
});

function startSave(): void {
  void internals(manager).save();
}

describe("settings save queue (BUG-0730)", () => {
  it("writes a change made while an unencrypted save is in flight", async () => {
    const gate = deferred<unknown>();
    const keySpy = vi
      .spyOn(internals(manager).secretsLoader, "getDeviceKey")
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue("device-key");

    startSave();
    expect(internals(manager).saveLock, "the first save holds the lock").toBe(
      true,
    );

    manager.density = "compact";
    startSave();

    gate.resolve("device-key");
    await within(() => expect(writes()).toBe(2));

    expect(stored().density).toBe("compact");
    expect(
      keySpy,
      "the follow-up must have started, not just the first save",
    ).toHaveBeenCalledTimes(2);
    expect(internals(manager).saveLock).toBe(false);
  });

  it("writes a change made while an encrypted profile saves", async () => {
    manager.isEncrypted = true;
    manager.isLocked = false;

    const gate = deferred<number>();
    const fieldSpy = vi
      .spyOn(internals(manager).secretsLoader, "applyFieldEncryption")
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue(0);

    startSave();
    expect(internals(manager).saveLock, "the first save holds the lock").toBe(
      true,
    );

    manager.density = "compact";
    startSave();

    gate.resolve(0);
    await within(() => expect(writes()).toBe(2));

    expect(stored().density).toBe("compact");
    expect(
      fieldSpy,
      "the follow-up must have started, not just the first save",
    ).toHaveBeenCalledTimes(2);
    expect(internals(manager).saveLock).toBe(false);
  });

  it("coalesces two changes made during one save into one follow-up", async () => {
    const gate = deferred<unknown>();
    const keySpy = vi
      .spyOn(internals(manager).secretsLoader, "getDeviceKey")
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue("device-key");

    startSave();
    expect(internals(manager).saveLock, "the first save holds the lock").toBe(
      true,
    );

    const tooltips = manager.showTooltips;
    manager.density = "compact";
    manager.showTooltips = !tooltips;
    // Two save calls while the lock is held — the effect's debounce plus an
    // explicit save — must still produce exactly one follow-up.
    startSave();
    startSave();

    gate.resolve("device-key");
    await within(() => expect(writes()).toBe(2));

    expect(stored().density).toBe("compact");
    expect(stored().showTooltips).toBe(!tooltips);
    expect(keySpy, "two queued calls, one follow-up").toHaveBeenCalledTimes(2);
    expect(internals(manager).saveLock).toBe(false);
  });

  it("drains a change made during the follow-up into exactly one more save", async () => {
    const firstGate = deferred<unknown>();
    const followUpGate = deferred<unknown>();
    const keySpy = vi
      .spyOn(internals(manager).secretsLoader, "getDeviceKey")
      .mockReturnValueOnce(firstGate.promise)
      .mockReturnValueOnce(followUpGate.promise)
      .mockResolvedValue("device-key");

    startSave();
    expect(internals(manager).saveLock, "the first save holds the lock").toBe(
      true,
    );

    manager.density = "compact";
    startSave();

    firstGate.resolve("device-key");
    await within(() => expect(keySpy).toHaveBeenCalledTimes(2));
    expect(
      internals(manager).saveLock,
      "the follow-up holds the lock at its own gate",
    ).toBe(true);

    const tooltips = manager.showTooltips;
    manager.showTooltips = !tooltips;
    startSave();

    followUpGate.resolve("device-key");
    await within(() => expect(writes()).toBe(3));

    expect(stored().density).toBe("compact");
    expect(stored().showTooltips).toBe(!tooltips);
    expect(keySpy, "first save + follow-up + one more").toHaveBeenCalledTimes(3);
    expect(internals(manager).saveLock).toBe(false);
  });

  it("skips the follow-up write when the blob is unchanged", async () => {
    const gate = deferred<unknown>();
    const keySpy = vi
      .spyOn(internals(manager).secretsLoader, "getDeviceKey")
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue("device-key");

    startSave();
    expect(internals(manager).saveLock, "the first save holds the lock").toBe(
      true,
    );

    // A change and its revert while the first save is in flight. The follow-up
    // must run (keySpy reaches 2) but find the same blob and skip the write.
    // That skip is only observable with the constant encryption mock; see the
    // module-level note.
    const tooltips = manager.showTooltips;
    manager.showTooltips = !tooltips;
    startSave();
    manager.showTooltips = tooltips;
    startSave();

    gate.resolve("device-key");
    await within(() => expect(keySpy).toHaveBeenCalledTimes(2));
    await within(() => expect(internals(manager).saveLock).toBe(false));

    expect(stored().showTooltips).toBe(tooltips);
    expect(writes(), "the follow-up must not rewrite identical data").toBe(1);
  });

  it("releases the lock and drains the queue when the in-flight save throws", async () => {
    const gate = deferred<unknown>();
    const keySpy = vi
      .spyOn(internals(manager).secretsLoader, "getDeviceKey")
      .mockReturnValueOnce(gate.promise)
      .mockResolvedValue("device-key");
    const saveSpy = vi
      .spyOn(StorageHelper, "safeSave")
      .mockImplementationOnce(() => {
        throw new Error("simulated storage failure");
      });
    // The save catch logs in DEV; silence the expected line.
    vi.spyOn(console, "error").mockImplementation(() => {});

    startSave();
    expect(internals(manager).saveLock, "the first save holds the lock").toBe(
      true,
    );

    manager.density = "compact";
    startSave();

    gate.resolve("device-key");
    // The first write throws; the follow-up still runs and writes the change.
    await within(() => expect(writes()).toBe(1));

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(stored().density).toBe("compact");
    expect(keySpy).toHaveBeenCalledTimes(2);
    expect(internals(manager).saveLock).toBe(false);
    expect(internals(manager).savePending).toBe(false);
  });
});
