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
 * Versioned one-shot migrations SettingsManager.load() runs on every parsed
 * settings blob (FEAT-0197 PR 3). Pure functions -- no $state, no
 * localStorage access except the one migration-flag read/write the broker
 * migration owns, which mirrors what load() did inline before this split.
 */

const BROKER_MIGRATION_KEY = "cachy_v0.94_broker_migrated_v2";

/**
 * Forces `bitunix` as the provider exactly once (first load after this
 * migration shipped), retires the removed `binance` provider, and falls back
 * to `bitunix` for any other unrecognised value.
 */
export function resolveApiProvider(rawProvider: unknown): "bitunix" | "bitget" {
  const migrationDone = localStorage.getItem(BROKER_MIGRATION_KEY);
  let loadedProvider = rawProvider;

  if (!migrationDone) {
    if (import.meta.env.DEV) {
      console.warn(
        "[Settings] First load of v0.94: Forcing Bitunix as default.",
      );
    }
    loadedProvider = "bitunix";
    localStorage.setItem(BROKER_MIGRATION_KEY, "true");
  }

  if (loadedProvider === "binance") {
    if (import.meta.env.DEV) {
      console.warn(
        "[Settings] Binance provider found (deprecated). Resetting to Bitunix.",
      );
    }
    loadedProvider = "bitunix";
  }

  const finalProvider = loadedProvider === "bitget" ? "bitget" : "bitunix";

  if (loadedProvider && loadedProvider !== finalProvider) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Settings] Invalid provider "${loadedProvider}" reset to "${finalProvider}"`,
      );
    }
  }

  return finalProvider;
}

/** Retires the "gemma" placeholder and any missing value. */
export function resolveGeminiModel(stored: string | undefined): string {
  if (stored === "gemma" || !stored) {
    if (import.meta.env.DEV) {
      console.warn(
        "[Settings] Migrating geminiModel to gemini-1.5-flash for stability.",
      );
    }
    return "gemini-1.5-flash";
  }
  return stored;
}

/**
 * Retires `claude-3-5-sonnet-20240620` (the old hardcoded default) and every
 * other Claude 2.x/3.x snapshot ID onto a current model -- the live model
 * picker in Settings -> AI takes over from here.
 */
export function resolveAnthropicModel(stored: string | undefined): string {
  if (!stored || /^claude-[23]/.test(stored)) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Settings] Migrating anthropicModel from "${stored}" to claude-sonnet-5 (retired).`,
      );
    }
    return "claude-sonnet-5";
  }
  return stored;
}
