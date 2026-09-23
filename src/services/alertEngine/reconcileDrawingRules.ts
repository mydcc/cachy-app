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
 * FEAT-0029 — what happens to an alert whose drawing the trader deleted.
 *
 * The decision, recorded in the item: **the rule is disabled and says why. It
 * is not deleted, and it does not keep firing.**
 *
 * Deleting the rule would throw away work the drawing never owned — a note, a
 * validity period, a fired history — and a line is easy to remove by accident.
 * Leaving it armed on the drawing's last level is worse than either: it would
 * fire on a threshold that is no longer on the chart.
 *
 * ## The gate, borrowed from FEAT-0387
 *
 * "The drawing is missing" has two causes that look identical per rule and
 * mean opposite things: the trader deleted that line, or `cachy_drawings_v1`
 * itself is gone — a fresh device, cleared site data, a rules backup restored
 * without its drawings. The second must not disable the trader's lines in one
 * silent pass, so absence only counts as evidence when the store was actually
 * readable. `reconcileOrphanedRules.ts` draws the same distinction for the
 * same reason; this is deliberately its shape.
 *
 * One gate is enough here where FEAT-0387 needed two. Its ratio gate exists
 * because a *migrated* rule cannot prove which alert it came from; a
 * drawing-anchored rule names its drawing outright, so a readable store that
 * does not contain that id is unambiguous.
 *
 * Class A throughout.
 */

import { browser } from "$app/environment";

import { DRAWINGS_STORAGE_KEY } from "../../lib/chart/drawings/types";
import type { RuleDocument } from "../../lib/rules/types";
import { logger } from "../logger";
import { readDrawingAnchorLedger, type DrawingAnchorLedger } from "./drawingAnchors";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";

/**
 * The drawing store as it was found, not merely the ids in it.
 *
 * `present: false` means the key was absent or unreadable — emphatically not
 * the same as a key holding an empty list. A key that is there and empty is a
 * trader who deleted their last drawing; a key that is not there at all is a
 * store that never existed on this device.
 */
export interface DrawingStoreSnapshot {
    present: boolean;
    ids: ReadonlySet<string>;
}

export interface DrawingReconciliation {
    /** A new list — the input is never mutated. */
    rules: RuleDocument[];
    /** Ids of the rules this run disabled, for the panel. */
    suspended: string[];
    /** Anchored rules left armed because the store proved nothing. */
    withheld: string[];
}

export function readDrawingStoreSnapshot(): DrawingStoreSnapshot {
    const empty: DrawingStoreSnapshot = { present: false, ids: new Set() };
    if (!browser) return empty;

    try {
        const raw = localStorage.getItem(DRAWINGS_STORAGE_KEY);
        if (raw === null) return empty;

        const parsed: unknown = JSON.parse(raw);
        const list = (parsed as { drawings?: unknown })?.drawings;
        if (!Array.isArray(list)) {
            logger.warn("alerts", "[FEAT-0029] Drawing store is not a document — treated as unreadable");
            return empty;
        }

        const ids = new Set<string>();
        for (const entry of list) {
            const id = (entry as { id?: unknown } | null)?.id;
            if (typeof id === "string") ids.add(id);
        }
        return { present: true, ids };
    } catch (e) {
        logger.warn("alerts", "[FEAT-0029] Drawing store unreadable — no rule disabled", e);
        return empty;
    }
}

/**
 * Returns the rule set with every rule whose drawing is gone disabled, plus
 * what it disabled and what it deliberately did not.
 *
 * A rule that is already disabled is left exactly as it is — not re-reported —
 * so a trader who disarmed a rule themselves never sees it listed as if we had
 * done it.
 *
 * The ledger entry of a rule whose drawing is gone is kept on purpose: it is
 * the evidence the panel needs to say *which* drawing went missing, and losing
 * it would turn a disabled rule into an unexplained one.
 *
 * Never throws: this runs during startup, and no bookkeeping is worth failing
 * the load that brings a trader's alarms back up.
 */
export function reconcileDrawingRules(
    rules: readonly RuleDocument[],
    store: DrawingStoreSnapshot,
    ledger: DrawingAnchorLedger,
): DrawingReconciliation {
    const suspended: string[] = [];
    const withheld: string[] = [];

    try {
        const next = rules.map((rule) => {
            const anchor = ledger[rule.id];
            if (!anchor) return rule;
            if (store.ids.has(anchor.drawingId)) return rule;

            if (!store.present) {
                // Only an armed rule counts as withheld: a rule the trader
                // already disabled is not being left dangerously armed.
                if (rule.enabled) withheld.push(rule.id);
                return rule;
            }

            if (!rule.enabled) return rule;
            suspended.push(rule.id);
            return { ...rule, enabled: false };
        });

        return { rules: next, suspended, withheld };
    } catch (e) {
        logger.error("alerts", "[FEAT-0029] Drawing reconciliation failed — rules left as they were", e);
        return { rules: [...rules], suspended: [], withheld: [] };
    }
}

/**
 * Runs the reconciliation against the stored rule set and persists the result.
 *
 * Writes only when something was actually disabled, so an ordinary start
 * touches no storage at all.
 */
export function reconcileStoredDrawingRules(): DrawingReconciliation {
    const nothing: DrawingReconciliation = { rules: [], suspended: [], withheld: [] };
    if (!browser) return nothing;

    try {
        const raw = localStorage.getItem(RULES_STORAGE_KEY);
        if (raw === null) return nothing;

        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            logger.warn("alerts", "[FEAT-0029] Rule store is not a list — no rule disabled");
            return nothing;
        }

        const result = reconcileDrawingRules(
            parsed as RuleDocument[],
            readDrawingStoreSnapshot(),
            readDrawingAnchorLedger().ledger,
        );

        if (result.suspended.length > 0) {
            localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(result.rules));
        }
        return result;
    } catch (e) {
        logger.error("alerts", "[FEAT-0029] Reading rules for drawing reconciliation failed", e);
        return nothing;
    }
}
