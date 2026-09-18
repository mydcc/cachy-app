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

export function readDrawingAnchorLedger(): DrawingAnchorLedger {
    if (!browser) return EMPTY;
    try {
        const raw = localStorage.getItem(RULE_DRAWING_STORAGE_KEY);
        if (raw === null) return EMPTY;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;

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
        return ledger;
    } catch (e) {
        // Unreadable is not evidence of anything. Returning empty means no
        // rule is treated as drawing-anchored this session, which leaves every
        // rule evaluating on its stored constant — stale, but armed. The
        // opposite default would disarm the trader silently.
        logger.warn("alerts", "[FEAT-0029] Drawing anchor ledger unreadable", e);
        return EMPTY;
    }
}

/** Records that `ruleId` watches `drawingId`. Returns the ledger as written. */
export function recordDrawingAnchor(
    ruleId: string,
    anchor: DrawingAnchor,
): DrawingAnchorLedger {
    const next = { ...readDrawingAnchorLedger(), [ruleId]: anchor };
    persist(next);
    return next;
}

function persist(ledger: DrawingAnchorLedger): void {
    if (!browser) return;
    try {
        localStorage.setItem(RULE_DRAWING_STORAGE_KEY, JSON.stringify(ledger));
    } catch (e) {
        logger.warn("alerts", "[FEAT-0029] Drawing anchor ledger could not be written", e);
    }
}
