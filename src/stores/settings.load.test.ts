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

/**
 * Characterisation tests for SettingsManager.load() (FEAT-0197 PR 1). No
 * production code changes here -- these pin current behaviour of the
 * 382-line load() before it gets split, covering the four things the
 * backlog item calls out: legacy-shape tolerance, the one-shot broker
 * migration, secretsReady resolving exactly once on every path, and that a
 * failed decrypt never touches the stored ciphertext.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsManager } from "./settings.svelte";
import { cryptoService } from "../services/cryptoService";
import { VENUE_DEFAULT_FEE_RATES } from "../lib/constants";

vi.mock("$app/environment", () => ({
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

const STORAGE_KEY = "cryptoCalculatorSettings";
const MIGRATION_KEY = "cachy_v0.94_broker_migrated_v2";

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

describe("SettingsManager.load() -- legacy-shape tolerance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("keeps fields present in an older, smaller stored shape instead of falling back to defaults", () => {
    // Ports the trade.svelte.ts regression (BUG-0182): a strict all-or-
    // nothing validator would reject a shape missing fields added since and
    // discard the whole thing. load() merges via spread instead, so this
    // should never happen here -- this test pins that it doesn't.
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiProvider: "bitget",
        openaiApiKey: "sk-legacy-user-key",
        favoriteSymbols: ["BTCUSDT"],
      }),
    );
    localStorageMock.setItem(MIGRATION_KEY, "true");

    const settings = new SettingsManager();

    expect(settings.openaiApiKey).toBe("sk-legacy-user-key");
    expect(settings.apiProvider).toBe("bitget");
    expect(settings.favoriteSymbols).toEqual(["BTCUSDT"]);
    // Fields absent from the legacy blob fall back to current defaults
    // rather than the whole load being discarded.
    expect(settings.showTechnicals).toBe(false);
    expect(settings.showTooltips).toBe(true);
    expect(settings.technicalsCacheTTL).toBe(60);
  });

  it("deep-merges nested objects instead of replacing them wholesale", () => {
    // galaxySettings blob predating camPos/galaxyRot -- exactly the case the
    // load() comment above the merge calls out.
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ galaxySettings: { particleCount: 5000 } }),
    );
    localStorageMock.setItem(MIGRATION_KEY, "true");

    const settings = new SettingsManager();

    expect(settings.galaxySettings.particleCount).toBe(5000);
    expect(settings.galaxySettings.camPos).toEqual({ x: 0, y: 2, z: 5 });
  });

  it("falls back to defaults without throwing when the stored blob is not valid JSON", () => {
    localStorageMock.setItem(STORAGE_KEY, "{not json");
    localStorageMock.setItem(MIGRATION_KEY, "true");

    let settings: SettingsManager | undefined;
    expect(() => {
      settings = new SettingsManager();
    }).not.toThrow();
    expect(settings!.apiProvider).toBe("bitunix");
  });
});

describe("SettingsManager.load() -- broker migration (cachy_v0.94_broker_migrated_v2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("forces bitunix as the provider on the first load when the migration hasn't run yet", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ apiProvider: "bitget" }),
    );

    const settings = new SettingsManager();

    expect(settings.apiProvider).toBe("bitunix");
    expect(localStorageMock.getItem(MIGRATION_KEY)).toBe("true");
  });

  it("is idempotent: once the migration flag is set, a stored bitget provider survives subsequent loads", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ apiProvider: "bitget" }),
    );
    localStorageMock.setItem(MIGRATION_KEY, "true");

    const settings = new SettingsManager();

    expect(settings.apiProvider).toBe("bitget");
  });

  it("resets a legacy 'binance' provider to bitunix regardless of migration state", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ apiProvider: "binance" }),
    );
    localStorageMock.setItem(MIGRATION_KEY, "true");

    const settings = new SettingsManager();

    expect(settings.apiProvider).toBe("bitunix");
  });
});

describe("SettingsManager.load() -- secretsReady resolves exactly once", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem(MIGRATION_KEY, "true");
  });

  it("resolves immediately when nothing is stored at all", async () => {
    const settings = new SettingsManager();
    await expect(settings.secretsReady).resolves.toBeUndefined();
  });

  it("resolves immediately when the stored shape has no encrypted secrets", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ apiProvider: "bitunix" }),
    );

    const settings = new SettingsManager();
    await expect(settings.secretsReady).resolves.toBeUndefined();
  });

  it("resolves after background decryption completes in obfuscation mode (no master password)", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        encryptedSecrets: {
          openaiApiKey: { ciphertext: "c", iv: "i", salt: "s", method: "AES-GCM" },
        },
      }),
    );
    vi.mocked(cryptoService.decrypt).mockResolvedValue("sk-decrypted");

    const settings = new SettingsManager();
    await settings.secretsReady;

    expect(settings.openaiApiKey).toBe("sk-decrypted");
    expect(settings.decryptionFailures).toBe(0);
  });

  it("resolves even when every secret fails to decrypt", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        encryptedSecrets: {
          openaiApiKey: { ciphertext: "c", iv: "i", salt: "s", method: "AES-GCM" },
        },
      }),
    );
    vi.mocked(cryptoService.decrypt).mockRejectedValue(new Error("bad key"));

    const settings = new SettingsManager();
    await settings.secretsReady;

    expect(settings.decryptionFailures).toBe(1);
  });

  it("resolves even when getting the device key itself throws, not just an individual decrypt", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        encryptedSecrets: {
          openaiApiKey: { ciphertext: "c", iv: "i", salt: "s", method: "AES-GCM" },
        },
      }),
    );
    vi.mocked(cryptoService.getOrGenerateDeviceKey).mockRejectedValue(
      new Error("IndexedDB unavailable"),
    );

    const settings = new SettingsManager();
    await settings.secretsReady;

    expect(settings.decryptionFailures).toBeGreaterThan(0);
  });

  it("does not create a second promise when a same-tab reload calls load() again", async () => {
    // secretsReady is created once in the constructor and never recreated,
    // so the 'storage' listener's re-invocation of load() on cross-tab
    // updates cannot make it resolve "a second time" -- there is
    // structurally only one Promise identity to observe. This pins that
    // identity and that a second load() still leaves it resolved.
    const settings = new SettingsManager();
    await settings.secretsReady;
    const before = settings.secretsReady;

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ apiProvider: "bitget" }),
    );
    (settings as unknown as { load(): void }).load();

    expect(settings.secretsReady).toBe(before);
    await expect(settings.secretsReady).resolves.toBeUndefined();
  });
});

describe("SettingsManager.load() -- device key loss detection", () => {
  const canaryBlob = { ciphertext: "canary-c", iv: "i", salt: "s", method: "AES-GCM" as const };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem(MIGRATION_KEY, "true");
    // Earlier describes leave rejected implementations behind
    // (clearAllMocks keeps them), so restore the happy path here.
    vi.mocked(cryptoService.getOrGenerateDeviceKey).mockReset().mockResolvedValue(
      { algorithm: { name: "PBKDF2" } } as unknown as CryptoKey,
    );
    vi.mocked(cryptoService.decrypt).mockReset();
  });

  it("flags deviceKeyLost when the canary fails to decrypt alongside the secrets", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        encryptedSecrets: {
          openaiApiKey: { ciphertext: "c", iv: "i", salt: "s", method: "AES-GCM" },
          _deviceKeyCanary: canaryBlob,
        },
      }),
    );
    vi.mocked(cryptoService.decrypt).mockRejectedValue(new Error("OperationError"));

    const settings = new SettingsManager();
    await settings.secretsReady;

    expect(settings.deviceKeyLost).toBe(true);
    expect(settings.decryptionFailures).toBeGreaterThan(0);
  });

  it("keeps deviceKeyLost false when the canary still decrypts", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        encryptedSecrets: {
          openaiApiKey: { ciphertext: "c", iv: "i", salt: "s", method: "AES-GCM" },
          _deviceKeyCanary: canaryBlob,
        },
      }),
    );
    vi.mocked(cryptoService.decrypt).mockResolvedValue("decrypted-value");

    const settings = new SettingsManager();
    await settings.secretsReady;

    expect(settings.deviceKeyLost).toBe(false);
    expect(settings.decryptionFailures).toBe(0);
  });

  it("does not flag deviceKeyLost for legacy data without a canary, even on failures", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        encryptedSecrets: {
          openaiApiKey: { ciphertext: "c", iv: "i", salt: "s", method: "AES-GCM" },
        },
      }),
    );
    vi.mocked(cryptoService.decrypt).mockRejectedValue(new Error("bad key"));

    const settings = new SettingsManager();
    await settings.secretsReady;

    expect(settings.decryptionFailures).toBeGreaterThan(0);
    expect(settings.deviceKeyLost).toBe(false);
  });
});

describe("SettingsManager.load() -- a failed decrypt never touches the stored ciphertext", () => {
  const originalBlob = {
    ciphertext: "original-ciphertext",
    iv: "i",
    salt: "s",
    method: "AES-GCM" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem(MIGRATION_KEY, "true");
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ encryptedSecrets: { openaiApiKey: originalBlob } }),
    );
    vi.mocked(cryptoService.decrypt).mockRejectedValue(new Error("bad key"));
  });

  it("keeps the original encrypted blob in memory, and leaves the plain field empty", async () => {
    const settings = new SettingsManager();
    await settings.secretsReady;

    expect(settings.encryptedSecrets?.openaiApiKey).toEqual(originalBlob);
    expect(settings.openaiApiKey).toBe("");
  });

  it("re-serializes the untouched ciphertext rather than dropping or overwriting it", async () => {
    const settings = new SettingsManager();
    await settings.secretsReady;

    const json = settings.toJSON();
    expect(json.encryptedSecrets?.openaiApiKey).toEqual(originalBlob);
  });
});

describe("SettingsManager -- showTooltips setting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem(MIGRATION_KEY, "true");
  });

  it("defaults showTooltips to true", () => {
    const settings = new SettingsManager();
    expect(settings.showTooltips).toBe(true);
    expect(settings.toJSON().showTooltips).toBe(true);
  });

  it("loads showTooltips = false from storage and roundtrips toJSON", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ showTooltips: false }),
    );

    const settings = new SettingsManager();
    expect(settings.showTooltips).toBe(false);
    expect(settings.toJSON().showTooltips).toBe(false);
  });
});

describe("SettingsManager feeRates (FEAT-0253) -- defaults, merge, serialize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    localStorageMock.setItem(MIGRATION_KEY, "true");
  });

  it("defaults feeRates to the venue defaults, cloned out of the constant", () => {
    const settings = new SettingsManager();

    expect(settings.feeRates).toEqual(VENUE_DEFAULT_FEE_RATES);
    // The $state proxy must not alias the module constant: editing a rate in
    // the Settings UI must not rewrite the default.
    expect(settings.feeRates.bitunix).not.toBe(VENUE_DEFAULT_FEE_RATES.bitunix);
  });

  it("does not mutate VENUE_DEFAULT_FEE_RATES when a rate is edited", () => {
    // B1 regression: the B1 review finding claimed the shallow clone shares
    // the constant's inner objects. The $state initializer already spreads
    // per-venue copies, and defaultSettings.feeRates does too — so editing a
    // rate must leave the documented defaults untouched.
    const settings = new SettingsManager();
    settings.feeRates.bitunix.maker = "0.0050";

    expect(VENUE_DEFAULT_FEE_RATES.bitunix).toEqual({
      maker: "0.0200",
      taker: "0.0600",
    });
    expect(VENUE_DEFAULT_FEE_RATES.bitget).toEqual({
      maker: "0.0200",
      taker: "0.0600",
    });
  });

  it("merges a partial stored blob, filling the missing venue from defaults", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        feeRates: { bitunix: { maker: "0.0100", taker: "0.0200" } },
      }),
    );

    const settings = new SettingsManager();

    expect(settings.feeRates.bitunix).toEqual({
      maker: "0.0100",
      taker: "0.0200",
    });
    expect(settings.feeRates.bitget).toEqual(VENUE_DEFAULT_FEE_RATES.bitget);
  });

  it("roundtrips edited feeRates through toJSON", () => {
    const settings = new SettingsManager();
    settings.feeRates.bitunix.maker = "0.0050";

    expect(settings.toJSON().feeRates.bitunix).toEqual({
      maker: "0.0050",
      taker: "0.0600",
    });
  });
});
