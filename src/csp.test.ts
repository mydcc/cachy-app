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
import fs from "node:fs";
import path from "node:path";
import svelteConfig from "../svelte.config.js";

describe("Content-Security-Policy Configuration (BUG-0270)", () => {
  const directives = svelteConfig.kit?.csp?.directives ?? {};
  const scriptSrc = directives["script-src"] ?? [];
  const connectSrc = directives["connect-src"] ?? [];

  it("svelte.config.js script-src must not contain unsafe-inline or bare unsafe-eval", () => {
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
    expect(scriptSrc).toContain("wasm-unsafe-eval");
    expect(scriptSrc).toContain("self");
  });

  it("svelte.config.js connect-src must not contain localhost or 127.0.0.1 dev origins", () => {
    for (const origin of connectSrc) {
      expect(origin).not.toMatch(/127\.0\.0\.1/);
      expect(origin).not.toMatch(/localhost/);
    }
  });

  it("src/app.html inline scripts must include nonce='%sveltekit.nonce%'", () => {
    const appHtmlPath = path.resolve(__dirname, "app.html");
    const appHtml = fs.readFileSync(appHtmlPath, "utf-8");

    // Match all <script ...> tags
    const scriptTagRegex = /<script\b([^>]*)>/gi;
    let match: RegExpExecArray | null;
    let executableScriptsCount = 0;

    while ((match = scriptTagRegex.exec(appHtml)) !== null) {
      const attrs = match[1];
      // Skip application/ld+json or non-executable scripts
      if (attrs.includes('type="application/ld+json"') || attrs.includes("type='application/ld+json'")) {
        continue;
      }
      executableScriptsCount++;
      expect(attrs).toContain('nonce="%sveltekit.nonce%"');
    }

    expect(executableScriptsCount).toBeGreaterThan(0);
  });

  it("src/hooks.server.ts must not override CSP with unsafe-inline or unsafe-eval", () => {
    const hooksPath = path.resolve(__dirname, "hooks.server.ts");
    const hooksContent = fs.readFileSync(hooksPath, "utf-8");

    // Must not hardcode unsafe CSP headers
    expect(hooksContent).not.toMatch(/Content-Security-Policy.*unsafe-inline/);
    expect(hooksContent).not.toMatch(/Content-Security-Policy.*(?<!wasm-)unsafe-eval/);
  });

  it("server.js fallback headers must not contain unsafe-inline, unsafe-eval, or dev origins", () => {
    const serverPath = path.resolve(__dirname, "../server.js");
    const serverContent = fs.readFileSync(serverPath, "utf-8");

    const cspMatch = serverContent.match(/Content-Security-Policy["'],\s*["']([^"']+)["']/);
    if (cspMatch) {
      const cspHeader = cspMatch[1];
      expect(cspHeader).not.toContain("unsafe-inline");
      expect(cspHeader).not.toMatch(/(?<!wasm-)unsafe-eval/);
      expect(cspHeader).not.toContain("127.0.0.1");
      expect(cspHeader).not.toContain("localhost");
    }
  });
});
