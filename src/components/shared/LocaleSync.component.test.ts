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
 * BUG-0708 — the effective locale used to follow only the locale store. This
 * pins both halves: without a reaction the flag is inert, and with
 * `LocaleSync` mounted the same toggle switches `de` to `de-tech` (and back)
 * without a reload while `<html lang>` stays `de`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import { get } from "svelte/store";
import { locale as svelteLocale } from "svelte-i18n";
import { i18nReady, setLocale } from "../../locales/i18n";
import { settingsState } from "../../stores/settings.svelte";
import LocaleSync from "./LocaleSync.svelte";

vi.mock("$app/env", () => ({
  browser: true,
}));

vi.mock("../../services/cryptoService", () => ({
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

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(async () => {
  await i18nReady;
  settingsState.forceEnglishTechnicalTerms = false;
  setLocale("de");
  await vi.waitFor(() => expect(get(svelteLocale)).toBe("de"), {
    timeout: 3_000,
  });

  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  if (component) unmount(component as never);
  component = null;
  host.remove();
  settingsState.forceEnglishTechnicalTerms = false;
  setLocale("en");
});

describe("LocaleSync (BUG-0708)", () => {
  it("leaves the effective locale at de when nothing tracks the flag", async () => {
    settingsState.forceEnglishTechnicalTerms = true;
    flushSync();
    await new Promise((r) => setTimeout(r, 50));

    expect(get(svelteLocale), "the pre-fix behaviour, kept as a baseline").toBe(
      "de",
    );
  });

  it("switches de to de-tech and back without a reload", async () => {
    component = mount(LocaleSync, { target: host }) as never;
    flushSync();

    settingsState.forceEnglishTechnicalTerms = true;
    flushSync();
    await vi.waitFor(() => expect(get(svelteLocale)).toBe("de-tech"), {
      timeout: 3_000,
    });
    expect(document.documentElement.lang).toBe("de");

    settingsState.forceEnglishTechnicalTerms = false;
    flushSync();
    await vi.waitFor(() => expect(get(svelteLocale)).toBe("de"), {
      timeout: 3_000,
    });
    expect(document.documentElement.lang).toBe("de");
  });
});
