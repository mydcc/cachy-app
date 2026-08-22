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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsManager } from "./settings.svelte";

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

describe("SettingsManager -- Burning Borders Configuration & Migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("initializes with sensible default burning borders targets", () => {
    const settings = new SettingsManager();

    expect(settings.enableBurningBorders).toBe(false);
    expect(settings.borderEffectColorMode).toBe("interactive");
    expect(settings.burnMarketOverviewTiles).toBe(true);
    expect(settings.burnFlashCards).toBe(true);
    expect(settings.burnCharts).toBe(false);
    expect(settings.burnModals).toBe(false);
    expect(settings.burnChannels).toBe(false);
    expect(settings.burnJournal).toBe(false);
    expect(settings.enableAmbientTopline).toBe(false);
    expect(settings.ambientToplineMode).toBe("symbol_orderflow");
    expect(settings.ambientToplineIntensity).toBe("standard");
    expect(settings.ambientToplineBursts).toBe(true);
  });

  it("migrates legacy burnNewsWindows / burnChannelWindows into burnChannels", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        enableBurningBorders: true,
        burnNewsWindows: true,
      }),
    );

    const settings = new SettingsManager();
    expect(settings.enableBurningBorders).toBe(true);
    expect(settings.burnChannels).toBe(true);
  });

  it("properly serializes and preserves burning borders settings", () => {
    const settings = new SettingsManager();
    settings.enableBurningBorders = true;
    settings.burnCharts = false;
    settings.burnJournal = true;
    settings.enableAmbientTopline = true;
    settings.ambientToplineMode = "risk_health";
    settings.ambientToplineIntensity = "vibrant";
    settings.ambientToplineBursts = false;

    const json = settings.toJSON();
    expect(json.enableBurningBorders).toBe(true);
    expect(json.burnCharts).toBe(false);
    expect(json.burnJournal).toBe(true);
    expect(json.burnMarketOverviewTiles).toBe(true);
    expect(json.enableAmbientTopline).toBe(true);
    expect(json.ambientToplineMode).toBe("risk_health");
    expect(json.ambientToplineIntensity).toBe("vibrant");
    expect(json.ambientToplineBursts).toBe(false);
  });
});
