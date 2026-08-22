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

import { describe, it, expect, vi } from "vitest";
import { SecretsLoader } from "./secretsLoader";
import { cryptoService } from "../../services/cryptoService";

vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("../../services/cryptoService", () => ({
  cryptoService: {
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    getOrGenerateDeviceKey: vi
      .fn()
      .mockResolvedValue({ algorithm: { name: "PBKDF2" } } as unknown as CryptoKey),
  },
}));

const canaryBlob = { ciphertext: "canary-c", iv: "i", salt: "s", method: "AES-GCM" as const };

describe("SecretsLoader.isDeviceKeyLost", () => {
  it("returns false when no canary blob exists (legacy data)", async () => {
    const loader = new SecretsLoader();
    await expect(
      loader.isDeviceKeyLost({ openaiApiKey: canaryBlob }),
    ).resolves.toBe(false);
  });

  it("returns false when there is nothing stored at all", async () => {
    const loader = new SecretsLoader();
    await expect(loader.isDeviceKeyLost(undefined)).resolves.toBe(false);
  });

  it("returns true when the canary fails to decrypt with the device key", async () => {
    vi.mocked(cryptoService.decrypt).mockRejectedValueOnce(
      new Error("OperationError"),
    );
    const loader = new SecretsLoader();
    await expect(
      loader.isDeviceKeyLost({ _deviceKeyCanary: canaryBlob }),
    ).resolves.toBe(true);
  });

  it("returns false when the canary decrypts successfully", async () => {
    vi.mocked(cryptoService.decrypt).mockResolvedValueOnce("canary");
    const loader = new SecretsLoader();
    await expect(
      loader.isDeviceKeyLost({ _deviceKeyCanary: canaryBlob }),
    ).resolves.toBe(false);
  });
});
