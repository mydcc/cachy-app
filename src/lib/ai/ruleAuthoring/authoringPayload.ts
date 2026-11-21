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
 * FEAT-0817 — the authoring payload, closed by its own signature.
 *
 * ADR-0030 decision 4 enumerates what may travel: the trader's prose, the
 * symbol, the trigger timeframe, and the machine-readable description of the
 * condition language. What may not travel, under *any* consent combination:
 * journal entries, account size, balances, open positions, other rules, any
 * id or document hash, any credential, and the registry's other entries.
 *
 * The enumeration is enforced structurally rather than by filtering. This
 * module reads no store and takes no context object — `buildAuthoringPayload`
 * has exactly four parameters, so there is no channel through which a journal
 * entry could arrive and nothing to strip on the way out. A filter would be a
 * list someone has to keep correct; four parameters are a list the compiler
 * keeps correct.
 *
 * `ruleAuthoringPayload.test.ts` pins the boundary against stores that are
 * full of Class A data, so "nothing leaked" is a statement about real content
 * rather than about empty fixtures.
 */

import type { TimeframeString } from "../../rules/types";
import type { ConditionLanguageDescription } from "./conditionLanguage";

/** What one authoring request carries. Nothing else may be added here. */
export interface AuthoringPayload {
  /** The trader's own description of the setup, verbatim. */
  prose: string;
  /** The market the rule will watch. */
  symbol: string;
  /** The evaluation anchor the conditions are written against. */
  triggerTimeframe: TimeframeString;
  /** Cachy's schema, not the trader's data. */
  language: ConditionLanguageDescription;
}

/** A chat turn, in the shape the transport already takes. */
export interface AuthoringMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Build the payload.
 *
 * Four separate parameters, deliberately not one options object carrying a
 * context: a caller cannot pass what this signature cannot name.
 */
export function buildAuthoringPayload(
  prose: string,
  symbol: string,
  triggerTimeframe: TimeframeString,
  language: ConditionLanguageDescription,
): AuthoringPayload {
  return {
    prose: prose.trim(),
    symbol: symbol.trim(),
    triggerTimeframe,
    language,
  };
}

/**
 * The instruction the model answers against.
 *
 * Two shapes and nothing between them: a draft, or a stated inability to
 * express the request. ADR-0030 decision 6 is explicit that a
 * plausible-looking document for an inexpressible request is the worst
 * available outcome, because it reads as an answer — so the instruction gives
 * the model a way to say no that is as easy to emit as a yes.
 *
 * The answer carries only `conditions`, `veto`, `exits` and `name`. It is not
 * a `RuleDocument`: the fields that decide lifecycle, risk and identity are
 * not merely forbidden here, they are absent from the shape the model is
 * asked for, so there is nothing for it to fill in.
 */
const SYSTEM_INSTRUCTION = `You translate a trader's description of a setup into Cachy's rule condition language.

Answer with exactly one JSON object and no other text, no markdown fence.

When the description can be expressed:
{"ok":true,"draft":{"name":"<short name>","conditions":<condition>,"veto":<condition, omit if none>,"exits":[{"when":<condition>,"close":"all"}],"notes":"<one sentence on what you assumed, omit if nothing>"}}

The "exits" key is optional. Omit it unless the description actually names a way out of the position.

When it cannot:
{"ok":false,"reason":"<what the language cannot express, in one or two sentences, naming the part of the description that has no equivalent>"}

Answer with ok:false rather than approximating. A draft that merely looks right costs the trader more than a stated refusal, because they will arm it.

Rules you must not break:
- Emit no stop, no order, no size, no consequence level, no id, no enabled flag, no timestamps. They are the trader's and will be rejected.
- Emit no account, position or external_feed condition inside "conditions".
- Use only the operand kinds, condition kinds, indicator ids, output lines, operators and enum values the language description lists. An id that is not listed will be refused by the core.
- Every condition carries the timeframe it reads. Default to the trigger timeframe unless the description names another one.`;

/**
 * The messages for one request.
 *
 * The language description goes in as JSON rather than as prose: it is a
 * machine-readable catalogue and the model has to emit values from it
 * verbatim, so rendering it into English would be a translation step for the
 * model to get wrong.
 */
export function buildAuthoringMessages(
  payload: AuthoringPayload,
): AuthoringMessage[] {
  return [
    { role: "system", content: SYSTEM_INSTRUCTION },
    {
      role: "system",
      content: `Condition language:\n${JSON.stringify(payload.language)}`,
    },
    {
      role: "user",
      content: [
        `Symbol: ${payload.symbol}`,
        `Trigger timeframe: ${payload.triggerTimeframe}`,
        "",
        "Description:",
        payload.prose,
      ].join("\n"),
    },
  ];
}

/**
 * The payload as the panel shows it before the first request — ADR-0030
 * decision 4's "the list is shown before the first request".
 *
 * Returns the four parts separately rather than a rendered string, so the
 * component decides the layout while this module stays the one place that
 * knows what is in a payload. The language description is summarised to a
 * count, because a trader reading the preview needs to know that Cachy's
 * schema travels, not to read 24 indicator definitions.
 */
export interface AuthoringPayloadPreview {
  prose: string;
  symbol: string;
  triggerTimeframe: TimeframeString;
  /** How many indicators the language description names. */
  indicatorCount: number;
}

export function previewAuthoringPayload(
  payload: AuthoringPayload,
): AuthoringPayloadPreview {
  return {
    prose: payload.prose,
    symbol: payload.symbol,
    triggerTimeframe: payload.triggerTimeframe,
    indicatorCount: payload.language.indicators.length,
  };
}
