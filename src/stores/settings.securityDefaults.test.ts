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

import { describe, it, expect } from "vitest";
import { defaultSettings } from "./settings.svelte";

/**
 * A shipped default credential is not a convenience — it is a working key in
 * every visitor's bundle and in every screenshot of the settings window. The
 * ImgBB default was exactly that (BUG-0720), so the invariant is pinned for
 * every credential-shaped field rather than just the one that was wrong.
 *
 * The list mirrors `SENSITIVE_KEYS` in `settings/secretsLoader.ts`; importing
 * that module here would pull the crypto/browser graph into a plain node test,
 * so the names are duplicated deliberately. When a new credential is added to
 * `SENSITIVE_KEYS`, add it here too — the point is to notice the default.
 */
const CREDENTIAL_DEFAULTS = [
  "imgbbApiKey",
  "cloudToken",
  "appAccessToken",
  "openaiApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "openrouterApiKey",
  "cryptoPanicApiKey",
  "newsApiKey",
  "cmcApiKey",
  "discordBotToken",
] as const;

describe("settings credential defaults (BUG-0720)", () => {
  it.each(CREDENTIAL_DEFAULTS)("ships %s empty", (key) => {
    expect(defaultSettings[key]).toBe("");
  });
});
