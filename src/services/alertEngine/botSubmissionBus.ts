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
 * FEAT-0807 — the notify channel between the order sink and the projection.
 *
 * The engine wiring (initAlertEngine) owns the sink and must tell the
 * `botsState` store when a bot's submission is in flight. It must not
 * import the store to do it: that edge — static or lazy — grows the
 * 197-module dependency cycle the architecture ratchet freezes
 * (scripts/arch-cycles.baseline.json, gate in cycle_ratchet.test.ts). So
 * the wiring notifies and the store subscribes, the same division the
 * evaluation loop uses for its panel-side readers, and this module is the
 * only edge either side holds. It imports nothing: a leaf cannot join a
 * cycle.
 *
 * `withBotOrders`' observer contract is unchanged — the wiring still owns
 * the generation guard; this channel only carries the snapshot across the
 * layer the guard may not reach across.
 */

/** Receives the in-flight snapshot after every change and once per reset. */
export type BotSubmissionsListener = (ids: ReadonlySet<string>) => void;

let listener: BotSubmissionsListener | undefined;

/**
 * Replaces the listener. The projection store registers itself when its
 * singleton is created; a later registration wins, which is what a test
 * importing a fresh copy of the store wants.
 */
export function setBotSubmissionsListener(next: BotSubmissionsListener | undefined): void {
    listener = next;
}

/** The sink's snapshot, handed to whoever is listening. */
export function notifyBotSubmissions(ids: ReadonlySet<string>): void {
    listener?.(ids);
}

/** The wiring's reset: a sink was retired or never armed. */
export function clearBotSubmissions(): void {
    listener?.(new Set());
}

// ---------------------------------------------------------------------------
// FEAT-0810 — the closing channel, same shape, other side of the trade.
//
// A close in flight is its own fact, not a submission: the projection shows
// `closing` while an exit travels, and `submitting` while an entry does,
// and the two must not overwrite each other. A second listener pair on the
// same leaf keeps both channels one import away from their two writers and
// zero imports away from the cycle the ratchet freezes.
// ---------------------------------------------------------------------------

/** Receives the in-flight closing snapshot after every change and once per reset. */
export type BotClosingListener = (ids: ReadonlySet<string>) => void;

let closingListener: BotClosingListener | undefined;

/** Replaces the closing listener; a later registration wins, as above. */
export function setBotClosingListener(next: BotClosingListener | undefined): void {
    closingListener = next;
}

/** The exit sink's closing snapshot, handed to whoever is listening. */
export function notifyBotClosing(ids: ReadonlySet<string>): void {
    closingListener?.(ids);
}

/** The wiring's reset: an exit sink was retired or never armed. */
export function clearBotClosing(): void {
    closingListener?.(new Set());
}
