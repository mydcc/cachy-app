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
import {
  defaultAccountState,
  keysForExchange,
  LEGACY_ACCOUNT_IDS,
} from "./accounts";
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

describe("SecretsLoader.applyAccounts", () => {
  const liveAccounts = () => defaultAccountState().accounts;

  it("migrates a legacy plaintext profile onto accounts, per venue", () => {
    // Arrange — storage as it looked before FEAT-0333.
    const loader = new SecretsLoader();
    const stored = {
      accounts: undefined,
      activeAccountId: undefined,
      apiKeys: {
        bitunix: { key: "bu-key", secret: "bu-secret" },
        bitget: { key: "bg-key", secret: "bg-secret", passphrase: "bg-pass" },
      },
      apiProvider: "bitget",
    } as never;

    // Act
    const result = loader.applyAccounts(stored, liveAccounts());

    // Assert — each venue's credentials reached that venue's account.
    expect(keysForExchange(result.accounts, "bitunix")).toEqual({
      key: "bu-key",
      secret: "bu-secret",
    });
    expect(keysForExchange(result.accounts, "bitget").passphrase).toBe("bg-pass");
    expect(result.isEncrypted).toBe(false);
  });

  it("re-indexes legacy ciphertext onto account ids without decrypting it", () => {
    const loader = new SecretsLoader();
    const stored = {
      accounts: undefined,
      encryptedApiKeys: { bitunix: "cipher-bu", bitget: "cipher-bg" },
      isEncrypted: true,
      apiProvider: "bitunix",
    } as never;

    const result = loader.applyAccounts(stored, liveAccounts());

    expect(result.encryptedAccountKeys?.[LEGACY_ACCOUNT_IDS.bitunix]).toBe("cipher-bu");
    expect(result.encryptedAccountKeys?.[LEGACY_ACCOUNT_IDS.bitget]).toBe("cipher-bg");
    expect(result.isEncrypted).toBe(true);
    expect(result.isLocked).toBe(true);
  });

  it("presents no credentials while ciphertext is the only source", () => {
    const loader = new SecretsLoader();
    const stored = {
      accounts: undefined,
      encryptedApiKeys: { bitunix: "cipher-bu" },
      isEncrypted: true,
    } as never;

    const result = loader.applyAccounts(stored, liveAccounts());

    const material = result.accounts.flatMap((a) => Object.values(a.keys));
    expect(material.every((v) => v === "")).toBe(true);
  });

  it("keeps account names while the credentials are locked away", () => {
    const loader = new SecretsLoader();
    const named = liveAccounts().map((a) =>
      a.exchange === "bitunix" ? { ...a, name: "Scalping" } : a,
    );
    const stored = {
      accounts: named,
      encryptedAccountKeys: { [LEGACY_ACCOUNT_IDS.bitunix]: "cipher-bu" },
      isEncrypted: true,
    } as never;

    const result = loader.applyAccounts(stored, named);

    expect(
      result.accounts.find((a) => a.exchange === "bitunix")?.name,
    ).toBe("Scalping");
  });

  it("does not re-migrate a profile that already carries accounts", () => {
    const loader = new SecretsLoader();
    const converted = liveAccounts().map((a) =>
      a.exchange === "bitunix" ? { ...a, keys: { key: "new", secret: "new" } } : a,
    );
    const stored = {
      accounts: converted,
      activeAccountId: LEGACY_ACCOUNT_IDS.bitunix,
      // Stale legacy block that must not win over the converted one.
      apiKeys: { bitunix: { key: "old", secret: "old" } },
    } as never;

    const result = loader.applyAccounts(stored, converted);

    expect(keysForExchange(result.accounts, "bitunix").key).toBe("new");
  });
});
