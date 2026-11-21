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
 * FEAT-0817 — the authoring port: gate, send, read.
 *
 * This is the single function the authoring surface calls, and the only place
 * in the tree that turns a trader's prose into a request. ADR-0030 decision 8
 * requires that `src/lib/rules/` and the alert engine never reach it;
 * `rule_authoring_port.test.ts` is what proves that, because the layer ratchet
 * cannot — an `alertEngine -> lib/ai` import would be *downhill*, which the
 * ratchet deliberately does not freeze.
 *
 * The model is never on the evaluation path. There is no entry point here that
 * takes a market snapshot, no function that answers "should this fire", and no
 * number in any return value that a gate could read as confidence.
 *
 * ## Why the payload comes in finished
 *
 * The caller builds the payload with `buildAuthoringPayload` and shows it with
 * `previewAuthoringPayload` before the first request. Taking the same object
 * here means the preview and the request are the same instance — the trader
 * cannot be shown one payload and have another sent, because there is only
 * one.
 *
 * ## Why the transport is injected
 *
 * So the tests mock the model rather than the network, and so this module
 * stays free of `appFetch`. The production adapter is
 * `authoringTransport.ts`; it is a separate file for the same reason.
 */

import {
  decideAuthoringEgress,
  type AllowedAuthoringTarget,
  type AuthoringEgressInput,
} from "./authoringEgress";
import {
  buildAuthoringMessages,
  type AuthoringMessage,
  type AuthoringPayload,
} from "./authoringPayload";
import {
  parseAuthoringAnswer,
  type AuthoringDraft,
} from "./draftAnswer";

/**
 * Sends the messages and returns the whole answer text.
 *
 * The parameter is the narrowed target, so a transport that could accept a
 * relay target does not satisfy this type. The gate's refusal is what a
 * trader reads; this is what a refactor runs into.
 */
export type AuthoringTransport = (
  target: AllowedAuthoringTarget,
  messages: AuthoringMessage[],
  signal?: AbortSignal,
) => Promise<string>;

export type AuthoringOutcome =
  /** The model proposed something the envelope could carry. Not yet validated. */
  | {
      kind: "draft";
      draft: AuthoringDraft;
      label: string;
      baseUrl: string;
      /**
       * The model id that answered, for `provenance.model`.
       *
       * Taken from the resolved target rather than from the reply: a model
       * that named itself would be recording its own attribution, and the
       * register of ADR-0012 decision 8 counts what actually happened.
       */
      model: string;
    }
  /** The language cannot express the request, with the model's own reason. */
  | { kind: "not_expressible"; reason: string }
  /** The reply could not be read. Never presented as either of the above. */
  | { kind: "unreadable"; detail: string }
  /** The request never left the device. */
  | {
      kind: "refused";
      refusal: "consent-off" | "relay-only" | "unresolved";
      label?: string;
      endpoint?: string;
      detail?: string;
    }
  /** The provider or the network failed. */
  | { kind: "failed"; detail: string }
  /** The trader cancelled. Not a failure, and shown as neither. */
  | { kind: "cancelled" };

export interface RequestRuleDraftInput {
  egress: AuthoringEgressInput;
  /** The same object the preview was rendered from. */
  payload: AuthoringPayload;
  transport: AuthoringTransport;
  signal?: AbortSignal;
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Ask for a draft.
 *
 * Never throws: every failure is a variant of the return type. The surface
 * renders all of them, and a thrown error there would be the one outcome with
 * no place to be shown.
 */
export async function requestRuleDraft(
  input: RequestRuleDraftInput,
): Promise<AuthoringOutcome> {
  const decision = decideAuthoringEgress(input.egress);

  if (!decision.allowed) {
    if (decision.refusal === "relay-only") {
      return {
        kind: "refused",
        refusal: "relay-only",
        label: decision.label,
        endpoint: decision.endpoint,
      };
    }
    if (decision.refusal === "unresolved") {
      return {
        kind: "refused",
        refusal: "unresolved",
        detail: decision.detail,
      };
    }
    return { kind: "refused", refusal: "consent-off" };
  }

  let reply: string;
  try {
    reply = await input.transport(
      decision.target,
      buildAuthoringMessages(input.payload),
      input.signal,
    );
  } catch (error: unknown) {
    if (isAbort(error)) return { kind: "cancelled" };
    return { kind: "failed", detail: detailOf(error) };
  }

  const answer = parseAuthoringAnswer(reply);
  if (answer.kind === "draft") {
    return {
      kind: "draft",
      draft: answer.draft,
      label: decision.label,
      baseUrl: decision.baseUrl,
      model: decision.target.model,
    };
  }
  return answer;
}
