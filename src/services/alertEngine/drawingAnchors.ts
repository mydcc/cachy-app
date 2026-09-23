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
 * FEAT-0029 — which rule watches which drawing.
 *
 * ## A ledger, not a field on the rule
 *
 * The obvious place for this is a field on `RuleDocument`. It is the wrong
 * place: the rule schema is owned by the Rust core (`technicals-wasm/src/rule/`),
 * which validates every document it is handed, and an operand kind meaning
 * "ask the chart" would have to exist there — a core change, a wasm rebuild,
 * and a new artifact for a binding that never affects how a comparison is
 * decided.
 *
 * So the rule stays an ordinary constant-threshold rule and this ledger says
 * where that constant comes from. `ruleOriginLedger.ts` (FEAT-0401) made the
 * same call for the same reason, and the shape here follows it deliberately.
 *
 * ## What "the threshold is rewritten" does not break
 *
 * `RuleEvaluationGate` dedupes on `document.id` and the core reads fired
 * history from `ctx.state` keyed the same way, so rewriting a rule's threshold
 * before evaluation changes what it compares against without touching what it
 * *is*. Identity, fired history, note and validity all survive — which is what
 * lets a moved drawing move its alert rather than replace it.
 *
 * Class A (ADR-0001): `localStorage` only.
 */

import { browser } from "$app/environment";

import { logger } from "../logger";

/** The `localStorage` key. Versioned like every other Class A document. */
export const RULE_DRAWING_STORAGE_KEY = "cachy_rule_drawing_v1";

export interface DrawingAnchor {
    /** The drawing this rule's threshold is read from. */
    drawingId: string;
    /**
     * The symbol the drawing belonged to when the alert was created.
     *
     * Stored rather than looked up, so the reconciliation below can tell "this
     * drawing was deleted" from "this drawing's store has not loaded yet"
     * without asking the chart which market it is showing.
     */
    symbol: string;
    createdAtMs: number;
}

/** ruleId → the drawing it watches. */
export type DrawingAnchorLedger = Readonly<Record<string, DrawingAnchor>>;

const EMPTY: DrawingAnchorLedger = Object.freeze({});

/**
 * The anchor ledger as it was found, not merely the anchors in it.
 *
 * BUG-0498 — the sibling store (`readDrawingStoreSnapshot`) already draws
 * this distinction and this one must too: a key holding `{}` is a trader who
 * never armed a drawing alert, while a key that throws or parses to nothing
 * usable is a binding that may have been lost. Flattening both to empty made
 * the loss indistinguishable from the honest case, and the resolver went on
 * evaluating possibly-anchored rules against their stored constants.
 */
export interface DrawingAnchorLedgerSnapshot {
    /** False when the ledger could not be read at all. */
    present: boolean;
    ledger: DrawingAnchorLedger;
}

export function readDrawingAnchorLedger(): DrawingAnchorLedgerSnapshot {
    const missing: DrawingAnchorLedgerSnapshot = { present: false, ledger: EMPTY };
    if (!browser) return missing;
    try {
        const raw = localStorage.getItem(RULE_DRAWING_STORAGE_KEY);
        // No key, no bindings: the honest empty, not a loss.
        if (raw === null) return { present: true, ledger: EMPTY };
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            logger.warn("alerts", "[FEAT-0029] Drawing anchor ledger has no ledger shape");
            return missing;
        }

        const ledger: Record<string, DrawingAnchor> = {};
        for (const [ruleId, entry] of Object.entries(parsed as Record<string, unknown>)) {
            const anchor = entry as Partial<DrawingAnchor> | null;
            if (typeof anchor?.drawingId !== "string" || !anchor.drawingId) continue;
            if (typeof anchor.symbol !== "string" || !anchor.symbol) continue;
            ledger[ruleId] = {
                drawingId: anchor.drawingId,
                symbol: anchor.symbol,
                createdAtMs:
                    typeof anchor.createdAtMs === "number" && Number.isFinite(anchor.createdAtMs)
                        ? anchor.createdAtMs
                        : 0,
            };
        }
        return { present: true, ledger };
    } catch (e) {
        // Unreadable is not evidence of anything — and, since BUG-0498, not
        // evidence of nothing either. The resolver holds drawing-shaped rules
        // rather than evaluating them on possibly abandoned constants.
        logger.warn("alerts", "[FEAT-0029] Drawing anchor ledger unreadable", e);
        return missing;
    }
}

/**
 * Records that `ruleId` watches `drawingId`.
 *
 * BUG-0498 — reports whether the write landed. A quota-full device swallows
 * the binding while the chart claims the alert is armed on the line; the
 * caller refuses instead. `ledger` is the in-memory state including the new
 * entry, whether or not it landed — the caller decides from `ok` alone.
 */
export function recordDrawingAnchor(
    ruleId: string,
    anchor: DrawingAnchor,
): { ok: boolean; ledger: DrawingAnchorLedger } {
    const next = { ...readDrawingAnchorLedger().ledger, [ruleId]: anchor };
    const ok = persist(next);
    return { ok, ledger: next };
}

function persist(ledger: DrawingAnchorLedger): boolean {
    // No storage off the client, and arming happens on the client — nothing
    // to report.
    if (!browser) return true;
    try {
        localStorage.setItem(RULE_DRAWING_STORAGE_KEY, JSON.stringify(ledger));
        return true;
    } catch (e) {
        logger.warn("alerts", "[FEAT-0029] Drawing anchor ledger could not be written", e);
        return false;
    }
}
