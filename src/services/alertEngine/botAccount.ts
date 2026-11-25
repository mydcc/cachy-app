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
 * FEAT-0825 / ADR-0028 — the account a bot executes against.
 *
 * The one place that answers "which account is this bot's?". A `simulate`
 * bot trades the paper account, which is an account of its own and not a mode
 * of an exchange account: there is one paper book, and switching exchange
 * accounts leaves it alone (`accountSession.svelte.ts`, "not cleared").
 *
 * The answer follows from the document's consequence level, never from what
 * is active on screen when the bot fires. That is the whole point of the
 * binding: a bot armed while the paper account was executing must not drift
 * onto whatever account the trader switches to next. A future `send` level
 * (FEAT-0035) adds an explicit, stored exchange account id here — written once
 * when the bot is armed, never re-resolved from `activeAccountId`.
 *
 * Nothing is stored for `simulate`, so the content hash does not move and a
 * template carries no account.
 */

import type { ConsequenceLevel, GridDocument, RuleDocument } from "../../lib/rules/types";

/**
 * The level that makes a rule a bot.
 *
 * Named rather than inlined at each call site because it is the definition of
 * what the bots surface manages, and three literals that happen to agree are
 * not a definition. `send` is deliberately not included: there is no `send`
 * path until FEAT-0035 builds one, gate, risk limits and confirmation
 * included.
 *
 * Moved here from `botStore.ts` (which re-exports it) by FEAT-0825: this
 * module is a leaf on purpose — no runtime import — so the projection and
 * both lanes can resolve a bot's account without joining the rule store's
 * import cycle.
 */
export const BOT_CONSEQUENCE_LEVEL: ConsequenceLevel = "simulate";

/** Whether a stored rule belongs on the bots surface. */
export function isBot(rule: RuleDocument): boolean {
    return rule.action?.consequence_level === BOT_CONSEQUENCE_LEVEL;
}

/** The paper account — the only account a bot can execute against today. */
export const PAPER_ACCOUNT = "paper" as const;

/**
 * Every account a bot can be bound to. One member until FEAT-0035 adds the
 * exchange accounts; a union of one is still a type, so a second member
 * makes every exhaustive switch over it fail to compile until it is handled.
 */
export type BotAccount = typeof PAPER_ACCOUNT;

/**
 * The account this bot executes against, or `null` for a rule that is not a
 * bot (a `notify` alert acts on no account at all).
 */
export function botAccountOf(rule: RuleDocument): BotAccount | null {
    return isBot(rule) ? PAPER_ACCOUNT : null;
}

/**
 * The account bots may execute against right now: the paper account while
 * paper trading is on, none while a live exchange account is active — no bot
 * reaches a live account before FEAT-0035.
 */
export function executingBotAccount(paperEnabled: boolean): BotAccount | null {
    return paperEnabled ? PAPER_ACCOUNT : null;
}

/**
 * Whether this bot's own account is the one executing. `false` for a
 * non-bot: an alert has no account to be available on.
 */
export function isBotAccountExecuting(
    rule: RuleDocument,
    executing: BotAccount | null,
): boolean {
    const account = botAccountOf(rule);
    return account !== null && account === executing;
}

function accountUnavailableFor(
    account: BotAccount | null,
    executing: BotAccount | null,
): boolean {
    if (executing === null) return true;
    return account !== null && account !== executing;
}

/**
 * The lanes' refusal test: `true` when no account executes at all, or when
 * this bot's own account is not the executing one.
 *
 * Narrower than `!isBotAccountExecuting` on purpose: a non-bot that reaches a
 * lane while an account executes is left to the lane's own
 * `level-not-supported`, the more specific cause. Calling it "paper off"
 * while paper is on would send whoever reads the log after a switch that is
 * not the problem.
 */
export function botAccountUnavailable(
    rule: RuleDocument,
    executing: BotAccount | null,
): boolean {
    return accountUnavailableFor(botAccountOf(rule), executing);
}

/** FEAT-0819 / ADR-0028 — whether a grid is bound to the paper account. */
export function isGridPaperOnly(grid: GridDocument): boolean {
    return grid.consequence_level === BOT_CONSEQUENCE_LEVEL;
}

/** The account a grid bot executes against, or `null` if non-paper. */
export function gridAccountOf(grid: GridDocument): BotAccount | null {
    return isGridPaperOnly(grid) ? PAPER_ACCOUNT : null;
}

/** Whether a grid bot's bound account is currently executing. */
export function isGridAccountExecuting(
    grid: GridDocument,
    executing: BotAccount | null,
): boolean {
    const account = gridAccountOf(grid);
    return account !== null && account === executing;
}

/**
 * FEAT-0819 / ADR-0028 — `true` when no bot account is executing (paper is
 * off, so ladder and stop-out are frozen with the paper book) or the grid's
 * account disagrees with the active executing account.
 */
export function gridAccountUnavailable(
    grid: GridDocument,
    executing: BotAccount | null,
): boolean {
    return accountUnavailableFor(gridAccountOf(grid), executing);
}
