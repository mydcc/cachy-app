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

// @vitest-environment node
//
// This test walks the source tree from disk. Under the happy-dom default set in
// vite.config.ts, import.meta.url is not a file:// URL and readFileSync rejects
// it. No DOM is needed here, so pin the node environment.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * Keeps the self-hosting instructions honest.
 *
 * Both editions are self-hosted. Since ADR-0002's BUG-0052 amendment, API
 * authentication uses self-issued, anonymous client tokens: the app obtains
 * one from its own server (`POST /api/auth/token`) without operator setup,
 * guarded routes answer 401 to unknown tokens with a deliberately identical
 * message, and rate limits answer 429. There is no deployment-wide secret —
 * and the guide must not resurrect one. These assertions pin the current
 * model into the documentation so the two cannot drift apart silently.
 *
 * In the spirit of `env_documentation.test.ts` and `whitepaper-claims.test.ts`:
 * this repository tests its documentation against reality rather than trusting
 * it to stay true.
 */

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const read = (relative: string) =>
  readFileSync(join(repoRoot, relative), "utf-8");

describe("self-hosting installation guide", () => {
  const install = read("docs/INSTALL.md");

  it("documents the self-issued client token model", () => {
    // The operator-facing story: nothing to configure, the app provisions
    // itself against its own server.
    expect(install).toMatch(/self-issued/i);
    expect(install).toMatch(/POST \/api\/auth\/token/);
  });

  it("does not resurrect the retired shared-secret setup", () => {
    // The pre-BUG-0052 flow told operators to generate a secret with openssl
    // and paste the same value into `.env` and the app. No route reads that
    // secret any more, so instructions to set it are pure noise — worse, they
    // imply the app rejects requests without it.
    expect(install).not.toMatch(/APP_ACCESS_TOKEN=/);
    expect(install).not.toMatch(/openssl rand -hex 32/);
  });

  it("covers the 401 that an unknown token produces", () => {
    // The failure mode this whole guide exists to prevent. If the
    // troubleshooting section is ever trimmed, this is the line to keep.
    expect(install).toMatch(/401/);
  });

  it("is linked from the README so it can actually be found", () => {
    expect(read("README.md")).toMatch(/docs\/INSTALL\.md/);
  });
});

describe("in-app user manual", () => {
  // Both languages, always — a token section that exists in German only leaves
  // every English reader with the same silent 401.
  const manuals = {
    de: read("src/lib/assets/content/guide.de.md"),
    en: read("src/lib/assets/content/guide.en.md"),
  };

  it.each(Object.entries(manuals))(
    "explains the app access token (%s)",
    (_lang, manual) => {
      expect(manual).toMatch(/App[- ]?(Access|Zugangs)[- ]?[Tt]oken/);
    },
  );

  it.each(Object.entries(manuals))(
    "points at the install guide for server context (%s)",
    (_lang, manual) => {
      // Knowing only the settings field is exactly the state that produced
      // this section in the first place; both manuals must hand readers over
      // to docs/INSTALL.md (or mention .env) for the full picture.
      expect(manual).toMatch(/\.env|INSTALL\.md/);
    },
  );
});

describe("the documented settings path matches the real UI", () => {
  // A rename of the settings label would otherwise leave every install
  // instruction pointing at a field that no longer exists, silently.
  const locales = {
    de: JSON.parse(read("src/locales/locales/de.json")),
    en: JSON.parse(read("src/locales/locales/en.json")),
  };

  it("still has the key the guides tell users to look for", () => {
    // Guards the assertions below: if the key moved, they would pass vacuously
    // against `undefined`.
    expect(locales.de.settings?.connections?.appAccessToken).toBeTruthy();
    expect(locales.en.settings?.connections?.appAccessToken).toBeTruthy();
  });

  it.each([
    ["de", "src/lib/assets/content/guide.de.md"],
    ["en", "src/lib/assets/content/guide.en.md"],
  ])("names the field as the UI labels it (%s)", (lang, path) => {
    const label = locales[lang as "de" | "en"].settings.connections
      .appAccessToken as string;

    // The label carries a parenthetical suffix in the UI ("App Access Token
    // (Server Security)"); prose only needs the name itself.
    const name = label.replace(/\s*\(.*\)\s*$/, "").trim();

    expect(read(path)).toContain(name);
  });
});
