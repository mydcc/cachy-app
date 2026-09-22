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
 * FEAT-0396 — the bot half of the rule store.
 *
 * A bot is not a second kind of thing. It is a `RuleDocument` with
 * `consequence_level: "simulate"`, living in `cachy_rules_v1` beside the
 * `notify` rules the alert panel arms, evaluated by the same loop against the
 * same conditions. That is what lets a strategy be tested as an alarm and then
 * promoted without being rewritten, and it is why this module is a *filter* and
 * not a store of its own.
 *
 * The separation the Automation tab provides is one of surface: the alert panel
 * shows what announces, this shows what acts. A second storage key would make
 * them two systems that drift.
 *
 * Class A (ADR-0001): strategy, `localStorage` only.
 */

import type { ConsequenceLevel, RuleDocument } from "../../lib/rules/types";
import { armRule, readRuleStore, removeRule } from "./armRule";

/**
 * The level that makes a rule a bot.
 *
 * Named rather than inlined at each call site because it is the definition of
 * what this tab manages, and three literals that happen to agree are not a
 * definition. `send` is deliberately not included: there is no `send` path
 * until FEAT-0035 builds one, gate, risk limits and confirmation included.
 */
export const BOT_CONSEQUENCE_LEVEL: ConsequenceLevel = "simulate";

/** Whether a stored rule belongs on the Automation tab. */
export function isBot(rule: RuleDocument): boolean {
  return rule.action?.consequence_level === BOT_CONSEQUENCE_LEVEL;
}

/**
 * Every bot in the store, disabled ones included.
 *
 * Disabled bots are listed rather than filtered out: a bot that vanishes when
 * it is switched off reads as deleted, and a trader who cannot see it cannot
 * switch it back on. The loop's own `enabled !== false` check is what actually
 * stops evaluation; this list is a view, not a gate.
 */
export function readBots(): RuleDocument[] {
  return readRuleStore().filter(isBot);
}

/**
 * Arm or disarm a bot, returning the updated document.
 *
 * `enabled` is outside the content hash on purpose — arming is not a change of
 * strategy — so this moves nothing a journal entry recorded. A test pins that,
 * because the guarantee is the item's second acceptance criterion and it would
 * break silently.
 *
 * Returns `undefined` when no bot has that id, rather than throwing: the caller
 * is a toggle in a list that may have been edited in another tab, and a thrown
 * error there would take the whole tab down over a stale row.
 */
export function setBotEnabled(botId: string, enabled: boolean): RuleDocument | undefined {
  const bot = readBots().find((r) => r.id === botId);
  if (!bot) return undefined;

  const updated: RuleDocument = { ...bot, enabled };
  armRule(updated);
  return updated;
}

/**
 * Remove a bot from the store.
 *
 * Only a bot: an id naming a `notify` rule is left alone and reported as not
 * found. The Automation tab must not be able to delete an alert the trader
 * armed from the panel, and the cheapest way to guarantee that is to make this
 * function unable to express it.
 */
export function deleteBot(botId: string): boolean {
  const target = readRuleStore().find((r) => r.id === botId);
  if (!target || !isBot(target)) return false;

  // BUG-0493 — the guard above is what makes this function worth having; the
  // write itself goes through `removeRule`, so there is one removal write to
  // `cachy_rules_v1` and every invalidation it performs (BUG-0486's anchor
  // forget) applies to a deleted bot too.
  removeRule(botId);
  return true;
}
