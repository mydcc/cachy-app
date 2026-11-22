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
 * FEAT-0817 — reading a model's answer, without believing it.
 *
 * Three outcomes, and the third one matters as much as the first two: a draft,
 * a stated inability to express the request, or an answer this module could
 * not read at all. The third is never dressed up as either of the others —
 * "the model replied with prose" and "the language cannot express your setup"
 * are different things to tell a trader, and merging them would send someone
 * rewriting a description that was fine.
 *
 * ## What this module does not do
 *
 * It does not validate conditions. The schema is defined once, in Rust
 * (ADR-0012), and a second opinion here is exactly the divergence that ends
 * with a trader testing one thing and the machine sending another. This checks
 * the *envelope* — is it JSON, does it carry the keys the instruction asked
 * for — and hands the condition trees to `ruleSchema.validate`, which refuses
 * field by field.
 *
 * It also never repairs. ADR-0030 decision 6 forbids silently making an
 * invalid draft validate; a draft that was quietly fixed is a draft the trader
 * did not write and did not read.
 *
 * ## Why the answer is not a RuleDocument
 *
 * The model is asked for `conditions`, `veto`, `exits` and `name`, and this
 * module copies exactly those four. Everything that decides lifecycle, risk or
 * identity — `enabled`, `id`, `created_at_ms`, `action`, `stop`, `provenance`,
 * `schema_version` — is not filtered out, it is never read. A field nobody
 * reads cannot be smuggled past a filter that someone forgot to update.
 */

import type { Condition, ExitRule } from "../../rules/types";

/** What the model proposed, reduced to the four things it is allowed to. */
export interface AuthoringDraft {
  /** A name for the rule, in the trader's words. Empty when none was given. */
  name: string;
  /** The trigger tree. Handed to the core unmodified. */
  conditions: Condition;
  /** The suppression tree, when one was proposed. */
  veto?: Condition;
  /**
   * Ways out of the position, when the description named one.
   *
   * Kept beside the document rather than inside it: the core refuses `exits`
   * on a `notify` rule (`ExitsAtNotifyLevel` —  an alert owns no position to
   * close), and an authoring draft is a notify document. They travel to the
   * bot at promotion instead, which is the moment a position-owning level and
   * the trader's own stop both exist.
   */
  exits?: ExitRule[];
  /** What the model says it assumed. Shown to the trader, never acted on. */
  notes?: string;
}

/** The three outcomes. */
export type AuthoringAnswer =
  | { kind: "draft"; draft: AuthoringDraft }
  | { kind: "not_expressible"; reason: string }
  /** The answer could not be read. `detail` is for the trader, not a log line. */
  | { kind: "unreadable"; detail: string };

/** True for a non-null object that is not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The JSON object in a model's reply.
 *
 * Models wrap JSON in a fence or a sentence often enough that refusing those
 * replies would make the feature feel broken for a reason that has nothing to
 * do with the trader's description. So a fence is stripped and the outermost
 * brace-delimited span is taken — but nothing beyond that is guessed: a reply
 * with no JSON at all is `unreadable`, not an approximation.
 */
function extractJsonObject(raw: string): unknown {
  const withoutFence = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;

  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** The exits the model proposed, or `undefined`. Shape only; the core judges. */
function readExits(value: unknown): ExitRule[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const exits: ExitRule[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isRecord(entry.when)) continue;
    // `close` and `fraction` are copied as given rather than defaulted: the
    // core refuses `partial` without a fraction and `all` with one, and that
    // refusal names the field. Defaulting here would answer a question the
    // trader should see asked.
    const exit: ExitRule = {
      when: entry.when as unknown as Condition,
      close: entry.close === "partial" ? "partial" : "all",
    };
    if (typeof entry.fraction === "string") exit.fraction = entry.fraction;
    exits.push(exit);
  }
  return exits.length > 0 ? exits : undefined;
}

/**
 * Read one model reply.
 *
 * `raw` is untrusted text from a third party, so every branch here narrows
 * from `unknown`. The condition trees are cast rather than checked, which is
 * deliberate and is the one place a cast is correct in this module: the next
 * thing that happens to them is `ruleSchema.validate`, and a check here would
 * be the second validator ADR-0012 forbids.
 */
export function parseAuthoringAnswer(raw: string): AuthoringAnswer {
  const parsed = extractJsonObject(raw);
  if (!isRecord(parsed)) {
    return {
      kind: "unreadable",
      detail: "the provider's reply did not contain a JSON object",
    };
  }

  if (parsed.ok === false) {
    const reason = textOf(parsed.reason);
    return reason
      ? { kind: "not_expressible", reason }
      : {
          kind: "unreadable",
          detail: "the provider refused the request without stating a reason",
        };
  }

  if (parsed.ok !== true) {
    return {
      kind: "unreadable",
      detail: "the provider's reply said neither that it could nor that it could not",
    };
  }

  const draft = parsed.draft;
  if (!isRecord(draft) || !isRecord(draft.conditions)) {
    return {
      kind: "unreadable",
      detail: "the provider answered with a draft that carries no conditions",
    };
  }

  const result: AuthoringDraft = {
    name: textOf(draft.name),
    conditions: draft.conditions as unknown as Condition,
  };
  if (isRecord(draft.veto)) result.veto = draft.veto as unknown as Condition;
  const exits = readExits(draft.exits);
  if (exits) result.exits = exits;
  const notes = textOf(draft.notes);
  if (notes) result.notes = notes;

  return { kind: "draft", draft: result };
}
