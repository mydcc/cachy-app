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
 * FEAT-0817 — the port, with the model mocked.
 *
 * The gate's own test proves what it *decides*. This one proves what that
 * decision *does*: with the switch off, or with a relay-only provider, the
 * transport is never called. A refusal that still sent the request would pass
 * the gate's test and fail the ADR, and it is the one failure a trader could
 * not notice.
 */

import { describe, expect, it, vi } from "vitest";

import type { ChatTarget } from "../completion";
import { buildConditionLanguageDescription } from "./conditionLanguage";
import { buildAuthoringPayload } from "./authoringPayload";
import { requestRuleDraft, type AuthoringTransport } from "./requestRuleDraft";

const direct: ChatTarget = {
  kind: "direct",
  label: "My OpenAI",
  flavor: "openai-chat",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.4-mini",
  apiKey: "test-key",
  provider: "openai",
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

const CONDITION = {
  kind: "compare",
  left: { kind: "indicator", indicator: { id: "rsi", params: { period: 14 } } },
  op: "lt",
  right: { kind: "constant", value: "30" },
  timeframe: "1h",
};

function payload() {
  return buildAuthoringPayload(
    "buy when RSI is under 30",
    "BTCUSDT",
    "1h",
    buildConditionLanguageDescription(4),
  );
}

function transportReturning(body: unknown): AuthoringTransport {
  return vi.fn(async () => JSON.stringify(body));
}

describe("requestRuleDraft (FEAT-0817)", () => {
  it("does not reach the transport with the switch off", async () => {
    const transport = transportReturning({ ok: true, draft: { conditions: CONDITION } });

    const outcome = await requestRuleDraft({
      egress: { consent: false, target: direct },
      payload: payload(),
      transport,
    });

    expect(outcome).toEqual({ kind: "refused", refusal: "consent-off" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not reach the transport for a relay-only provider", async () => {
    const transport = transportReturning({ ok: true, draft: { conditions: CONDITION } });

    const outcome = await requestRuleDraft({
      egress: { consent: true, target: relayOnly },
      payload: payload(),
      transport,
    });

    expect(outcome).toMatchObject({
      kind: "refused",
      refusal: "relay-only",
      label: "Gemini",
      endpoint: "/api/ai/gemini",
    });
    // The whole point of ADR-0030 decision 2: the prose never travels through
    // Cachy infrastructure, so there is no call at all — not a call whose
    // result is discarded.
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends exactly the payload the caller built, to the resolved target", async () => {
    const transport = transportReturning({ ok: true, draft: { conditions: CONDITION } });
    const built = payload();

    await requestRuleDraft({
      egress: { consent: true, target: direct },
      payload: built,
      transport,
    });

    expect(transport).toHaveBeenCalledTimes(1);
    const [target, messages] = vi.mocked(transport).mock.calls[0];
    expect(target).toBe(direct);

    // The preview the panel showed was rendered from `built`; the messages go
    // out from the same object, so the two cannot differ.
    const serialized = JSON.stringify(messages);
    expect(serialized).toContain("buy when RSI is under 30");
    expect(serialized).toContain("BTCUSDT");
  });

  it("returns the draft with the recipient it actually reached", async () => {
    const transport = transportReturning({
      ok: true,
      draft: { name: "RSI oversold", conditions: CONDITION },
    });

    const outcome = await requestRuleDraft({
      egress: { consent: true, target: direct },
      payload: payload(),
      transport,
    });

    expect(outcome).toMatchObject({
      kind: "draft",
      label: "My OpenAI",
      baseUrl: "https://api.openai.com/v1",
    });
  });

  it("passes a stated inability through as itself", async () => {
    const transport = transportReturning({
      ok: false,
      reason: "No operand expresses order-book depth.",
    });

    const outcome = await requestRuleDraft({
      egress: { consent: true, target: direct },
      payload: payload(),
      transport,
    });

    expect(outcome).toEqual({
      kind: "not_expressible",
      reason: "No operand expresses order-book depth.",
    });
  });

  it("reports a provider failure as a failure, not as a refusal", async () => {
    const transport: AuthoringTransport = vi.fn(async () => {
      throw new Error("HTTP 401: bad key");
    });

    const outcome = await requestRuleDraft({
      egress: { consent: true, target: direct },
      payload: payload(),
      transport,
    });

    expect(outcome).toEqual({ kind: "failed", detail: "HTTP 401: bad key" });
  });

  it("reports a cancellation as neither a failure nor a refusal", async () => {
    const transport: AuthoringTransport = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    const outcome = await requestRuleDraft({
      egress: { consent: true, target: direct },
      payload: payload(),
      transport,
    });

    // A trader who pressed cancel must not be shown an error box.
    expect(outcome).toEqual({ kind: "cancelled" });
  });

  it("never throws, whatever the provider does", async () => {
    const transport: AuthoringTransport = vi.fn(async () => {
      throw "a string, because providers are not careful";
    });

    await expect(
      requestRuleDraft({
        egress: { consent: true, target: direct },
        payload: payload(),
        transport,
      }),
    ).resolves.toMatchObject({ kind: "failed" });
  });
});
