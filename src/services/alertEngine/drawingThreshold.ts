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
 * FEAT-0029 — reading a drawing-anchored rule's threshold at one anchor.
 *
 * ## What this replaces, and what it does not
 *
 * A drawing-anchored rule is stored as an ordinary constant-threshold rule.
 * Before each evaluation, the constant is replaced by the drawing's level at
 * that candle's timestamp. Nothing else about the document changes — not its
 * id, not its conditions' shape, not its frequency or note.
 *
 * That is why "moving a drawing moves its alert" needs no code of its own: the
 * level is read fresh at every anchor, so the alert is never anchored to a
 * number, only ever to the line. The stored constant is a fallback the
 * evaluator never reaches while the drawing exists.
 *
 * ## Refusing rather than guessing
 *
 * Every refusal returns a reason and evaluates nothing. A drawing-anchored
 * rule that fell back to its stored constant would fire on a level that is no
 * longer on the chart — the unverifiable trigger FEAT-0029 rejected when it
 * decided what a deleted drawing does to its alert. Silence is the only safe
 * direction here, and the reason is what makes the silence explainable.
 */

import { Decimal } from "decimal.js";

import { levelAt } from "../../lib/chart/drawings/levelAt";
import type { ChartDrawing } from "../../lib/chart/drawings/types";
import type { RuleDocument } from "../../lib/rules/types";
import type { DrawingAnchorLedgerSnapshot } from "./drawingAnchors";

/** Why a drawing-anchored rule could not be evaluated at this anchor. */
export type DrawingThresholdRefusal =
    /** The ledger names a drawing the store does not have — deleted. */
    | "drawing-missing"
    /** The drawing store could not be read; absence proves nothing. */
    | "drawing-store-unreadable"
    /**
     * The anchor ledger could not be read, so a rule with the drawing-alert
     * shape cannot be told apart from a rule that merely looks like one —
     * BUG-0498. Held rather than evaluated on a possibly abandoned constant.
     */
    | "drawing-anchor-ledger-unreadable"
    /** A vertical trend line: no level at any timestamp. */
    | "drawing-has-no-level"
    /** The rule is not the single comparison this feature knows how to rewrite. */
    | "unsupported-condition";

export type ThresholdResolution =
    /** Not anchored to a drawing — evaluate the document unchanged. */
    | { kind: "not-anchored" }
    | { kind: "rewritten"; rule: RuleDocument; level: Decimal }
    /**
     * The drawing the binding was lost to. Absent exactly when there is no
     * binding to name — the ledger itself could not be read.
     */
    | { kind: "unresolvable"; reason: DrawingThresholdRefusal; drawingId?: string };

export interface DrawingThresholdPorts {
    ledger: () => DrawingAnchorLedgerSnapshot;
    /** The drawing, or null when the store does not have it. */
    drawing: (drawingId: string) => ChartDrawing | null;
    /**
     * Hydrate the drawing store before it is read.
     *
     * Called only on the path that actually names a drawing (BUG-0484): the
     * overwhelming majority of resolutions ends at `not-anchored` without
     * ever touching the store, and loading it for those would tax every rule
     * on every evaluation for nothing.
     */
    loadDrawings: () => void;
    /**
     * Whether the drawing store was readable at all.
     *
     * Same distinction `readAlertStoreSnapshot` draws for FEAT-0387: a store
     * that is present and does not contain the drawing is a deletion; a store
     * that could not be read is no evidence at all, and must not be allowed to
     * disable anything.
     */
    storePresent: () => boolean;
}

/**
 * Whether this document is one whose threshold can be rewritten.
 *
 * Only a single top-level comparison against a constant qualifies — the exact
 * shape `createDrawingAlert` produces. A nested `all`/`any` group is refused
 * rather than searched: guessing which of several constants stands for the
 * line would silently rewrite the wrong one, and a trader who combined a
 * drawing with an RSI condition deserves an explicit answer rather than a
 * plausible one.
 */
function rewritableRight(rule: RuleDocument): boolean {
    const condition = rule.conditions;
    return condition.kind === "compare" && condition.right.kind === "constant";
}

/**
 * The rule to evaluate at `anchorMs`, or why there is none.
 *
 * Never mutates `rule`: the caller's copy is the stored document, and the
 * rewritten one exists only for this evaluation.
 */
export function resolveDrawingThreshold(
    rule: RuleDocument,
    anchorMs: number,
    ports: DrawingThresholdPorts,
): ThresholdResolution {
    const snapshot = ports.ledger();
    if (!snapshot.present) {
        // BUG-0498 — the binding store is unreadable, so no rule id can be
        // attributed to a drawing. A rule with the drawing-alert shape (the
        // single comparison `createDrawingAlert` produces) might be watching
        // a line that has long since moved: evaluating its stored constant
        // would fire — and, with an order intent, submit — at an abandoned
        // level, in silence. Held with a reason instead. Anything with any
        // other shape provably was never a drawing alert and keeps evaluating
        // normally, so an unreadable ledger does not make ordinary alerts
        // inert wholesale.
        if (!rewritableRight(rule)) return { kind: "not-anchored" };
        return { kind: "unresolvable", reason: "drawing-anchor-ledger-unreadable" };
    }

    const anchor = snapshot.ledger[rule.id];
    if (!anchor) return { kind: "not-anchored" };

    ports.loadDrawings();
    const drawing = ports.drawing(anchor.drawingId);
    if (!drawing) {
        // `storePresent` is asked only here, on the path where the answer
        // changes something. It reads and parses the drawing store, and this
        // function runs once per rule per candle — paying that on every
        // successful evaluation would tax the hot path for a distinction that
        // only matters when a drawing is already missing.
        const reason = ports.storePresent() ? "drawing-missing" : "drawing-store-unreadable";
        return { kind: "unresolvable", reason, drawingId: anchor.drawingId };
    }

    if (!rewritableRight(rule)) {
        return {
            kind: "unresolvable",
            reason: "unsupported-condition",
            drawingId: anchor.drawingId,
        };
    }

    const level = levelAt(drawing, anchorMs);
    if (!level) {
        return {
            kind: "unresolvable",
            reason: "drawing-has-no-level",
            drawingId: anchor.drawingId,
        };
    }

    // `rule.conditions.kind === "compare"` is established by `rewritableRight`
    // above; the cast carries that across the assignment rather than
    // re-checking it.
    const condition = rule.conditions as Extract<RuleDocument["conditions"], { kind: "compare" }>;
    return {
        kind: "rewritten",
        level,
        rule: {
            ...rule,
            conditions: {
                ...condition,
                right: { kind: "constant", value: level.toString() },
            },
        },
    };
}
