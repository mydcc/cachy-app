/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * FEAT-0396 / FEAT-0811 — creating bots: from a stored alert (promotion) or
 * from the fields the trader answered (a direct draft).
 *
 * Both paths end in the same place — an unarmed `simulate` document in the
 * rule store — and share everything the core cannot see: which identity is
 * free, and that the store is written through `armRule`, never beside it.
 * The derivation for a promotion lives in the core (`RuleDocument::promote`),
 * which decides level, provenance and arming; a direct draft is assembled in
 * TypeScript from the editor's fields, which is why that path validates
 * explicitly before anything is written.
 *
 * The source alert of a promotion is never written back. It does not need to
 * be — the core takes it by reference and returns a new value — and `armRule`
 * appends rather than replaces, because the bot's `id` is one nothing else
 * holds. That is the whole of "the source alert is left unchanged and still
 * armed": no code path here touches it.
 *
 * Class A (ADR-0001): every document here is strategy and stays in
 * `localStorage`.
 */

import { ruleSchema } from "../../lib/rules/ruleSchema";
import type {
  Condition,
  DecimalString,
  EntryTriggerMode,
  ExitRule,
  FiringPolicy,
  OrderIntent,
  RuleDocument,
  StopDistance,
  TimeframeString,
} from "../../lib/rules/types";
import { armRule, readRuleStore } from "./armRule";
import { freeRuleId } from "./ruleIdentity";

/**
 * Raised when the alert a promotion names is not in the store.
 *
 * Its own error rather than a refusal: the core refuses *documents*, and there
 * is no document here to refuse. A trader sees this when a rule was deleted in
 * another tab between opening the promote dialog and confirming it.
 */
export class AlertNotFoundError extends Error {
  public readonly translationKey = "dashboard.alerts.panel.alertNotFound";
  constructor(alertId: string) {
    super(`no stored rule has id ${alertId}`);
    this.name = "AlertNotFoundError";
  }
}

/** The new bot, and the rule set as it now stands. */
export interface Promotion {
  bot: RuleDocument;
  rules: RuleDocument[];
}

/**
 * Promote the stored alert `alertId` into a bot that proposes `order`.
 *
 * Returns the new document and the rule set including it. Throws
 * `AlertNotFoundError` when no such rule is stored, `RuleStoreUnreadableError`
 * when the store cannot be parsed, and `RuleRefusedError` when the core refuses
 * the derived document — most often because `order` names a size no account
 * could carry, which is refused here rather than at the moment it would have
 * been submitted.
 *
 * The bot comes back disarmed. Arming it is the trader's own act, and a
 * separate one from choosing a size.
 */
export function promoteAlertToBot(
  alertId: string,
  order: OrderIntent,
  createdAtMs: number = Date.now(),
): Promotion {
  const rules = readRuleStore();
  const alert = rules.find((r) => r.id === alertId);
  if (!alert) throw new AlertNotFoundError(alertId);

  const bot = ruleSchema.promote(
    alert,
    freeRuleId(new Set(rules.map((r) => r.id))),
    order,
    createdAtMs,
  );

  return { bot, rules: armRule(bot) };
}

/** Everything a directly created bot can carry, all of it optional-shaped
 * exactly as the document's own fields are: absent means the default. */
export interface BotDraftFields {
  /** Falls back to the symbol — a row never renders nameless. */
  name?: string;
  symbol: string;
  trigger_timeframe: TimeframeString;
  /** The entry condition. */
  conditions: Condition;
  order: OrderIntent;
  /** Absent means no exits beyond the resting stop (never an empty array). */
  exits?: ExitRule[];
  take_profit?: StopDistance;
  firing_policy?: FiringPolicy;
  max_positions?: number;
  max_entries_per_day?: number;
  max_risk_per_position?: DecimalString;
  budget_cap?: DecimalString;
  entry_trigger?: EntryTriggerMode;
}

/** The new draft, and the rule set as it now stands. */
export interface Creation {
  bot: RuleDocument;
  rules: RuleDocument[];
}

/**
 * FEAT-0811 — create a bot directly, from the fields the trader answered.
 *
 * The mirror of `promoteAlertToBot` above: same store, same identity
 * discipline, same unarmed result. The one difference is where the document
 * comes from — promotion derives it from a stored alert the core has already
 * validated, while direct creation assembles it in TypeScript, which is why
 * this path validates explicitly before anything is written: a refusal names
 * the field while the form is still open, and the store never holds a
 * document the core would refuse.
 *
 * The draft comes back **unarmed** (`enabled: false`), exactly as a promotion
 * does. Creating is choosing what the bot would do; arming it is a separate
 * act.
 */
export function createBotDraft(
  fields: BotDraftFields,
  createdAtMs: number = Date.now(),
): Creation {
  // Read once for both consumers: the identity must not collide with a rule
  // this function is about to add, and the write re-reads inside `armRule`
  // anyway — but the id is chosen against the same snapshot the caller's
  // form was opened against.
  const rules = readRuleStore();

  const document: RuleDocument = {
    // Stamped with whatever the core currently reads — the same discipline
    // the copy path (`duplicateRule`) follows, so a draft never arms under a
    // version the core would have to migrate first.
    schema_version: ruleSchema.schemaVersion() as RuleDocument["schema_version"],
    id: freeRuleId(new Set(rules.map((r) => r.id))),
    name: fields.name ?? fields.symbol,
    symbol: fields.symbol,
    trigger_timeframe: fields.trigger_timeframe,
    conditions: fields.conditions,
    action: {
      consequence_level: "simulate",
      order: fields.order,
    },
    // Absent stays absent on every optional field below: the canonical form
    // a fresh authoring produces is the one the core serialises, and an
    // explicit empty exits array would be refused (`empty_exits_array`)
    // before it could mislead anyone.
    ...(fields.exits !== undefined ? { exits: fields.exits } : {}),
    ...(fields.take_profit !== undefined ? { take_profit: fields.take_profit } : {}),
    ...(fields.firing_policy !== undefined
      ? { firing_policy: fields.firing_policy }
      : {}),
    ...(fields.max_positions !== undefined
      ? { max_positions: fields.max_positions }
      : {}),
    ...(fields.max_entries_per_day !== undefined
      ? { max_entries_per_day: fields.max_entries_per_day }
      : {}),
    ...(fields.max_risk_per_position !== undefined
      ? { max_risk_per_position: fields.max_risk_per_position }
      : {}),
    ...(fields.budget_cap !== undefined ? { budget_cap: fields.budget_cap } : {}),
    ...(fields.entry_trigger !== undefined
      ? { entry_trigger: fields.entry_trigger }
      : {}),
    // The unarmed draft: creating is choosing, arming is acting.
    enabled: false,
    provenance: { source: "human", created_at_ms: createdAtMs },
  };

  // Validate before the write, not after: the refusal anchors to a field the
  // form still shows, and the store never holds a document the core refuses.
  const validated = ruleSchema.validate(document);

  return { bot: validated, rules: armRule(validated) };
}
