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
 * FEAT-0396 — promoting an alert into a bot.
 *
 * The derivation itself lives in the core (`RuleDocument::promote`), which is
 * what decides the new document's level, provenance and arming. This file owns
 * the half the core cannot see: which alert is being promoted, what identity is
 * free, and that both documents end up in the store.
 *
 * The source alert is never written back. It does not need to be — the core
 * takes it by reference and returns a new value — and `armRule` appends rather
 * than replaces, because the bot's `id` is one nothing else holds. That is the
 * whole of "the source alert is left unchanged and still armed": no code path
 * here touches it.
 *
 * Class A (ADR-0001): both documents are strategy and stay in `localStorage`.
 */

import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { OrderIntent, RuleDocument } from "../../lib/rules/types";
import { generateId } from "../../utils/utils";
import { armRule, readRuleStore } from "./armRule";

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
 * An identity no stored rule holds.
 *
 * The retry is not superstition about UUIDs. `armRule` replaces by `id`, so a
 * collision would not produce a duplicate — it would silently overwrite an
 * existing rule with the bot, and the trader would find a strategy missing with
 * nothing to explain it. `newAccountId` and `newProviderId` guard the same way.
 */
function freeRuleId(taken: ReadonlySet<string>): string {
  let id = generateId();
  while (taken.has(id)) id = generateId();
  return id;
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
