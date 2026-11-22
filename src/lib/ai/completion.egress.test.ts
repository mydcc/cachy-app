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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * BUG-0835 — where the request actually goes versus where the app says it goes.
 *
 * Two defects in the one transport every AI feature shares: a provider redirect
 * could re-address a POST (and its body) to a second origin, and a loopback
 * provider failed with advice that blames CORS and points at the relay.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  streamCompletion,
  type ChatTarget,
} from "./completion";
import { ProviderRedirectError } from "./providerRedirect";

const MESSAGES = [{ role: "user", content: "secret strategy prose" }];

const directTarget = (baseUrl: string): ChatTarget => ({
  kind: "direct",
  label: "My Provider",
  flavor: "openai-chat",
  baseUrl,
  model: "m",
  apiKey: "k",
  provider: "openai",
});

const localTarget = (baseUrl: string): ChatTarget => ({
  kind: "local",
  label: "Ollama",
  flavor: "openai-chat",
  baseUrl,
  model: "m",
  provider: "ollama",
});

/** What a browser hands back for `redirect: "manual"` when the server redirects. */
const opaqueRedirect = () =>
  ({ type: "opaqueredirect", status: 0, ok: false, body: null }) as Response;

/** What a non-browser fetch hands back for `redirect: "manual"`. */
const plainRedirect = (status: number) =>
  ({ type: "basic", status, ok: false, body: null }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("redirects are refused, not followed", () => {
  for (const [name, make] of [
    ["direct", () => directTarget("https://api.example.com/v1")],
    ["local", () => localTarget("http://localhost:11434")],
  ] as const) {
    it(`asks the ${name} fetch not to follow a redirect`, async () => {
      const fetchMock = vi.fn().mockResolvedValue(opaqueRedirect());
      vi.stubGlobal("fetch", fetchMock);

      await streamCompletion(make(), { messages: MESSAGES }).catch(() => {});

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    });

    it(`names the configured recipient when the ${name} provider redirects`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(opaqueRedirect()));

      const failure = await streamCompletion(make(), {
        messages: MESSAGES,
      }).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ProviderRedirectError);
      expect((failure as Error).message).toMatch(/redirect/i);
      expect((failure as Error).message).toContain(
        name === "direct" ? "api.example.com" : "localhost:11434",
      );
    });
  }

  it("treats a visible 307/308 like an opaque redirect", async () => {
    for (const status of [307, 308]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(plainRedirect(status)));

      const failure = await streamCompletion(
        directTarget("https://api.example.com/v1"),
        { messages: MESSAGES },
      ).catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ProviderRedirectError);
    }
  });

  it("does not dress the refusal up as a CORS problem or suggest the relay", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(opaqueRedirect()));

    const failure = (await streamCompletion(
      directTarget("https://api.example.com/v1"),
      { messages: MESSAGES },
    ).catch((e: unknown) => e)) as Error;

    expect(failure.message).not.toMatch(/relay|CORS/i);
  });
});

describe("a loopback provider names the connection policy", () => {
  const blocked = () =>
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

  it("direct: names the policy and does not suggest the relay or CORS", async () => {
    blocked();

    const failure = (await streamCompletion(
      directTarget("http://localhost:20128/v1"),
      { messages: MESSAGES },
    ).catch((e: unknown) => e)) as Error;

    expect(failure.message).toMatch(/connection policy/i);
    expect(failure.message).not.toMatch(/relay|CORS/i);
  });

  it("local (Ollama default): names the policy instead of CORS advice", async () => {
    blocked();

    const failure = (await streamCompletion(localTarget(""), {
      messages: MESSAGES,
    }).catch((e: unknown) => e)) as Error;

    expect(failure.message).toMatch(/connection policy/i);
    expect(failure.message).not.toMatch(/relay|CORS|OLLAMA_ORIGINS/i);
  });

  it("a remote HTTPS provider keeps the CORS / relay advice", async () => {
    blocked();

    const failure = (await streamCompletion(
      directTarget("https://api.example.com/v1"),
      { messages: MESSAGES },
    ).catch((e: unknown) => e)) as Error;

    expect(failure.message).toMatch(/CORS/);
    expect(failure.message).toMatch(/relay/i);
  });
});
