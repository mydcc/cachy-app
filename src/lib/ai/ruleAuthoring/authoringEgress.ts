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
 * FEAT-0817 — whether an authoring request may leave the device, and to whom.
 *
 * Two refusals, both fail-closed, both stated:
 *
 * 1. **No consent.** `aiRuleAuthoringEgress` is its own switch, default off
 *    and revocable (ADR-0030 decision 3). It is checked before anything else
 *    and is never implied by `aiShareTradeContext`: this module does not read
 *    that setting, which is how "independent in both directions" is a property
 *    rather than a promise.
 *
 * 2. **The ADR-0019 server relay.** That hop exists so a *credential* can
 *    reach a provider that will not answer a cross-origin request. Carrying
 *    strategy prose through it would make Cachy a recipient of Class A
 *    strategy, which is the line ADR-0001 draws. So authoring refuses a
 *    relay-only provider and names the relay in the refusal — never a silent
 *    fallback (ADR-0030 decision 2).
 *
 * A loopback entry resolves as `local` and a CORS-capable provider as
 * `direct`; both are browser-direct and are treated identically, because
 * ADR-0030 decision 1 says a zero-egress setup is a configuration and not a
 * second code path.
 *
 * ## Why the target is an argument
 *
 * `resolveChatTarget` lives in the transport module and reaches `appFetch`
 * behind it. This gate *decides about* a resolution rather than performing
 * one, so it stays a pure function the egress test can exercise without a
 * transport, and `import type` leaves no edge in the import graph the
 * architecture ratchet measures.
 */

import type { ChatTarget } from "../completion";

/**
 * The targets authoring may use: the two browser-direct ones.
 *
 * Narrowed as a type rather than only checked at runtime, so a transport that
 * accepted a relay target would not compile. The refusal below is what a
 * trader reads; this is what keeps a later refactor from routing past it.
 */
export type AllowedAuthoringTarget = Extract<
  ChatTarget,
  { kind: "local" } | { kind: "direct" }
>;

export type AuthoringEgressRefusal =
  /** The authoring switch is off. */
  | "consent-off"
  /** The resolved provider only works through the ADR-0019 server relay. */
  | "relay-only"
  /** No usable provider: no key, no base URL, no model. */
  | "unresolved";

export type AuthoringEgressDecision =
  | {
      allowed: true;
      /** The registry entry's label, for the consent UI and the panel. */
      label: string;
      /** The endpoint the prose will actually reach. */
      baseUrl: string;
      target: AllowedAuthoringTarget;
    }
  | { allowed: false; refusal: "consent-off" }
  | {
      allowed: false;
      refusal: "relay-only";
      label: string;
      /** The Cachy route the request would otherwise take. Named on purpose. */
      endpoint: string;
    }
  | { allowed: false; refusal: "unresolved"; detail: string };

export interface AuthoringEgressInput {
  /** `settingsState.aiRuleAuthoringEgress`. Nothing else may stand in for it. */
  consent: boolean;
  /**
   * The resolved provider, or `null` when resolution threw — which it does
   * for a missing key, base URL or model.
   */
  target: ChatTarget | null;
  /** Why resolution failed, when it did. Shown to the trader. */
  resolveError?: string;
}

/**
 * Decide one request.
 *
 * Consent is read first and short-circuits: a revoked switch stops every
 * subsequent request, and a refusal that first inspected the provider would
 * make the switch look like a second opinion on the configuration rather than
 * the gate it is.
 */
export function decideAuthoringEgress(
  input: AuthoringEgressInput,
): AuthoringEgressDecision {
  if (!input.consent) return { allowed: false, refusal: "consent-off" };

  const target = input.target;
  if (!target) {
    return {
      allowed: false,
      refusal: "unresolved",
      detail: input.resolveError ?? "no AI provider is configured",
    };
  }

  if (target.kind === "relay") {
    return {
      allowed: false,
      refusal: "relay-only",
      label: target.label,
      endpoint: target.endpoint,
    };
  }

  return {
    allowed: true,
    label: target.label,
    baseUrl: target.baseUrl,
    target,
  };
}
