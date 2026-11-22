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

// @vitest-environment node

/*
 * FEAT-0817, ADR-0030 decisions 1, 2 and 3 — who may receive a draft request.
 *
 * Two refusals carry the ADR, and each is tested for the thing that would go
 * wrong if it were written the other way round:
 *
 * - consent off must refuse *before* looking at the provider, or the switch
 *   reads as a second opinion on the configuration rather than the gate.
 * - a relay-only provider must refuse and name the relay, because a silent
 *   fallback is the failure ADR-0030 decision 2 exists to prevent — and it is
 *   the failure a reader cannot see, since the request succeeds.
 */

import { describe, expect, it } from "vitest";

import type { ChatTarget } from "../completion";
import { decideAuthoringEgress } from "./authoringEgress";

const direct: ChatTarget = {
  kind: "direct",
  label: "My OpenAI",
  flavor: "openai-chat",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.4-mini",
  apiKey: "test-key",
  provider: "openai",
};

const loopback: ChatTarget = {
  kind: "local",
  label: "Ollama",
  flavor: "openai-chat",
  baseUrl: "http://localhost:11434",
  model: "qwen3",
  provider: "ollama",
};

const relayOnly: ChatTarget = {
  kind: "relay",
  label: "Gemini",
  endpoint: "/api/ai/gemini",
  flavor: "google-generate",
  model: "gemini-3.5-flash-lite",
  apiKey: "test-key",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  provider: "gemini",
};

describe("authoring egress gate (FEAT-0817)", () => {
  it("refuses with the switch off, even with a usable provider", () => {
    const decision = decideAuthoringEgress({ consent: false, target: direct });

    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ refusal: "consent-off" });
  });

  it("refuses with the switch off before it inspects the provider", () => {
    // The same refusal for a relay-only provider and for no provider at all:
    // the switch is the gate, not a verdict on the configuration. If consent
    // were checked second, one of these would report `relay-only` or
    // `unresolved` and a trader with the switch off would be told to fix
    // their provider.
    expect(decideAuthoringEgress({ consent: false, target: relayOnly }))
      .toMatchObject({ refusal: "consent-off" });
    expect(decideAuthoringEgress({ consent: false, target: null }))
      .toMatchObject({ refusal: "consent-off" });
  });

  it("refuses a relay-only provider and names the relay route", () => {
    const decision = decideAuthoringEgress({ consent: true, target: relayOnly });

    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({
      refusal: "relay-only",
      label: "Gemini",
      endpoint: "/api/ai/gemini",
    });
  });

  it("never hands back a relay target, so nothing can fall back to it", () => {
    const decision = decideAuthoringEgress({ consent: true, target: relayOnly });

    // The property that matters more than the message: there is no target in
    // the refusal, so a caller that ignored `allowed` still has nothing to
    // send through.
    expect(decision).not.toHaveProperty("target");
  });

  it("allows a browser-direct provider and reports who receives the prose", () => {
    const decision = decideAuthoringEgress({ consent: true, target: direct });

    expect(decision).toMatchObject({
      allowed: true,
      label: "My OpenAI",
      baseUrl: "https://api.openai.com/v1",
    });
  });

  it("treats a loopback entry exactly like any other direct provider", () => {
    // ADR-0030 decision 1: a zero-egress setup is a configuration, not a
    // second code path. The only difference may be the endpoint itself.
    const local = decideAuthoringEgress({ consent: true, target: loopback });
    const remote = decideAuthoringEgress({ consent: true, target: direct });

    expect(local.allowed).toBe(true);
    expect(remote.allowed).toBe(true);
    if (!local.allowed || !remote.allowed) return;
    expect(Object.keys(local).sort()).toEqual(Object.keys(remote).sort());
    expect(local.baseUrl).toBe("http://localhost:11434");
  });

  it("refuses an unconfigured provider with the resolver's own reason", () => {
    const decision = decideAuthoringEgress({
      consent: true,
      target: null,
      resolveError: "No model selected for openai. Please choose one in Settings.",
    });

    expect(decision).toMatchObject({
      refusal: "unresolved",
      detail: "No model selected for openai. Please choose one in Settings.",
    });
  });

  it("still refuses an unconfigured provider when the resolver said nothing", () => {
    const decision = decideAuthoringEgress({ consent: true, target: null });

    expect(decision.allowed).toBe(false);
    expect(decision).toMatchObject({ refusal: "unresolved" });
  });
});
