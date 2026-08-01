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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { settingsState } from "../stores/settings.svelte";
import { appAuthHeaders, appFetch } from "./appAuth";

describe("appAuthHeaders", () => {
  const originalToken = settingsState.appAccessToken;

  afterEach(() => {
    settingsState.appAccessToken = originalToken;
  });

  it("attaches x-app-access-token when a token is configured", () => {
    settingsState.appAccessToken = "secret-token";
    expect(appAuthHeaders()["x-app-access-token"]).toBe("secret-token");
  });

  it("omits the header rather than sending it empty", () => {
    settingsState.appAccessToken = "";
    expect(appAuthHeaders()).not.toHaveProperty("x-app-access-token");
  });

  it("merges with caller-provided headers instead of replacing them", () => {
    settingsState.appAccessToken = "secret-token";
    const headers = appAuthHeaders({ "Content-Type": "application/json" });
    expect(headers).toEqual({
      "Content-Type": "application/json",
      "x-app-access-token": "secret-token",
    });
  });
});

describe("appFetch", () => {
  const originalToken = settingsState.appAccessToken;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    settingsState.appAccessToken = "secret-token";
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("{}"));
  });

  afterEach(() => {
    settingsState.appAccessToken = originalToken;
    globalThis.fetch = originalFetch;
  });

  it("sends the token header while preserving method and body", async () => {
    await appFetch("/api/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: "bitunix" }),
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/balance",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ exchange: "bitunix" }),
        headers: {
          "Content-Type": "application/json",
          "x-app-access-token": "secret-token",
        },
      }),
    );
  });
});
