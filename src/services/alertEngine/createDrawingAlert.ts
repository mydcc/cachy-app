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
 * FEAT-0029 — arming an alert on a drawing.
 *
 * ## Which way it must cross
 *
 * The comparison is chosen from where price is *now* relative to the line:
 * below it arms `gte`, above it arms `lte`. A rule armed the other way round
 * holds the instant it is created, so it would announce immediately and tell
 * the trader nothing — the line has not been touched, it was already on that
 * side of it.
 *
 * `frequency` is left absent, which the core reads as `once`. Together with
 * the direction above that is what makes this a crossing alert rather than a
 * standing "price is above this" condition: it announces the first time price
 * reaches the line and then stops.
 *
 * ## The threshold written here is a starting value
 *
 * `right.value` is the level at the moment of arming. Evaluation replaces it
 * on every candle from the drawing itself (`drawingThreshold.ts`), so for a
 * sloped line this constant is stale within one candle — deliberately. It
 * exists so that the stored document is a complete, valid rule on its own, and
 * so that the panel has something to render before the first evaluation.
 *
 * Class A: the rule, the ledger entry and the drawing all stay on the device.
 */

import { Decimal } from "decimal.js";

import { levelAt } from "../../lib/chart/drawings/levelAt";
import type { ChartDrawing } from "../../lib/chart/drawings/types";
import type { RuleDocument } from "../../lib/rules/types";
import { generateId } from "../../utils/utils";
import { logger } from "../logger";
import { armRule, removeRule } from "./armRule";
import { recordDrawingAnchor } from "./drawingAnchors";

export interface DrawingAlertRequest {
    drawing: ChartDrawing;
    /** The chart's timeframe — the rule's evaluation anchor. */
    timeframe: string;
    /** Where price is now, which decides the direction the rule watches. */
    currentPrice: Decimal;
    /** When the alert is being armed; the level is read for this instant. */
    nowMs: number;
    /** The trader's own name for it. Falls back to a description of the line. */
    name?: string;
}

/** Why a drawing could not be armed. */
export type DrawingAlertRefusal =
    | "drawing-has-no-level"
    | "price-on-the-line"
    /**
     * The binding of the rule to its line could not be persisted — BUG-0498.
     * Refusing is honest: the chart would otherwise report the alert armed on
     * a line it never follows.
     */
    | "drawing-anchor-not-persisted";

export type DrawingAlertResult =
    | { ok: true; rule: RuleDocument }
    | { ok: false; reason: DrawingAlertRefusal };

function defaultName(drawing: ChartDrawing): string {
    return drawing.label ?? (drawing.kind === "horizontal" ? "Line alert" : "Trend line alert");
}

/**
 * Builds the rule for a drawing without storing it.
 *
 * Split from `armDrawingAlert` so the choice of direction — the part with a
 * decision in it — can be tested without touching `localStorage`.
 */
export function buildDrawingAlert(request: DrawingAlertRequest): DrawingAlertResult {
    const level = levelAt(request.drawing, request.nowMs);
    if (!level) return { ok: false, reason: "drawing-has-no-level" };

    // Exactly on the line there is no side to cross from, and either direction
    // would hold immediately. Refusing is honest; picking one would arm an
    // alert that announces itself before the trader has let go of the mouse.
    if (request.currentPrice.eq(level)) return { ok: false, reason: "price-on-the-line" };

    const op = request.currentPrice.lt(level) ? "gte" : "lte";

    return {
        ok: true,
        rule: {
            schema_version: 2,
            id: generateId(),
            name: request.name ?? defaultName(request.drawing),
            symbol: request.drawing.symbol,
            trigger_timeframe: request.timeframe,
            conditions: {
                kind: "compare",
                left: { kind: "price", field: "close" },
                op,
                right: { kind: "constant", value: level.toString() },
                timeframe: request.timeframe,
            },
            action: { consequence_level: "notify" },
            enabled: true,
            provenance: { source: "human", created_at_ms: request.nowMs },
        } as RuleDocument,
    };
}

/**
 * Builds the rule, stores it, and records which drawing it watches.
 *
 * The ledger entry is written after the rule, not before: an entry pointing at
 * a rule that was never stored would make the reconciliation report a rule
 * nobody can see, and the opposite order merely leaves an ordinary rule with a
 * stale constant — recoverable, and visible.
 *
 * BUG-0498 — either write can fail on a quota-full device, and a success
 * report then lies about an alert that never follows its line. A rule store
 * that throws is refused outright; a ledger that does not land is refused
 * after a best-effort rollback of the rule, so no phantom constant alert is
 * left armed behind a failure report. Neither rollback nor refusal ever
 * throws: the chart calls this from a click handler.
 */
export function armDrawingAlert(request: DrawingAlertRequest): DrawingAlertResult {
    const built = buildDrawingAlert(request);
    if (!built.ok) return built;

    try {
        armRule(built.rule);
    } catch (e) {
        logger.warn("alerts", "[FEAT-0029] Drawing alert rule could not be written", e);
        return { ok: false, reason: "drawing-anchor-not-persisted" };
    }
    const anchored = recordDrawingAnchor(built.rule.id, {
        drawingId: request.drawing.id,
        symbol: request.drawing.symbol,
        createdAtMs: request.nowMs,
    });
    if (!anchored.ok) {
        try {
            removeRule(built.rule.id);
        } catch (e) {
            logger.warn("alerts", "[FEAT-0029] Drawing alert rollback failed", e);
        }
        return { ok: false, reason: "drawing-anchor-not-persisted" };
    }
    return built;
}
