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

  it("waits for the secrets to be decrypted before sending", async () => {
    // The regression: the token is restored from localStorage by an async
    // decryption, while the account/positions/orders/balance fetches all run
    // from onMount. Firing before the decryption lands meant an empty token
    // and a 401 on every page load.
    let releaseSecrets!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSecrets = resolve;
    });

    const readySpy = vi
      .spyOn(settingsState, "secretsReady", "get")
      .mockReturnValue(gate);

    settingsState.appAccessToken = "";
    const pending = appFetch("/api/balance", { method: "POST" });

    // Still gated: nothing may go out while the token is unresolved.
    await Promise.resolve();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Decryption lands, then the request goes out carrying the token.
    settingsState.appAccessToken = "secret-token";
    releaseSecrets();
    await pending;

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/balance",
      expect.objectContaining({
        headers: { "x-app-access-token": "secret-token" },
      }),
    );

    readySpy.mockRestore();
  });

  it("issues a token before the first request when none is configured yet", async () => {
    settingsState.appAccessToken = "";
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/auth/token") {
        return Promise.resolve(new Response(JSON.stringify({ token: "fresh-token" })));
      }
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    await appFetch("/api/balance", { method: "POST" });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "/api/auth/token", { method: "POST" });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/balance",
      expect.objectContaining({
        headers: { "x-app-access-token": "fresh-token" },
      }),
    );
    expect(settingsState.appAccessToken).toBe("fresh-token");
  });

  it("re-issues the token and retries once when the server no longer recognises it", async () => {
    // Mirrors checkClientToken's in-memory store resetting on a server
    // restart: the client still has a token, the server has forgotten it.
    settingsState.appAccessToken = "stale-token";
    let balanceCalls = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/auth/token") {
        return Promise.resolve(new Response(JSON.stringify({ token: "fresh-token" })));
      }
      balanceCalls += 1;
      if (balanceCalls === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: "Unauthorized: Invalid or missing client access token" }),
            { status: 401 },
          ),
        );
      }
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;

    const response = await appFetch("/api/balance", { method: "POST" });

    expect(response.status).toBe(200);
    expect(balanceCalls).toBe(2);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/balance",
      expect.objectContaining({ headers: { "x-app-access-token": "fresh-token" } }),
    );
    expect(settingsState.appAccessToken).toBe("fresh-token");
  });

  it("does not retry a 401 that is unrelated to the client token", async () => {
    settingsState.appAccessToken = "secret-token";
    let balanceCalls = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/auth/token") {
        throw new Error("should not re-issue a token for this error");
      }
      balanceCalls += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Missing API Credentials" }), { status: 401 }),
      );
    }) as typeof fetch;

    const response = await appFetch("/api/balance", { method: "POST" });

    expect(response.status).toBe(401);
    expect(balanceCalls).toBe(1);
    expect(settingsState.appAccessToken).toBe("secret-token");
  });
});
