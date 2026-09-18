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
 * FEAT-0480 — where chart drawings live between sessions.
 *
 * Class A (ADR-0001): `localStorage` and nowhere else. A drawing says what a
 * trader believes about a market, which is as personal as the journal.
 *
 * ## Persisting explicitly, not reactively
 *
 * Every mutator writes through `persist()` instead of an `$effect` watching
 * the array. An effect needs a component or an `$effect.root` to own it, and
 * this store is read from the chart, from the rule engine's port and from
 * tests — none of which should have to own a reactive scope to make a delete
 * stick. The write is one JSON dump of a handful of objects; the simpler
 * lifetime is worth more than the saved keystrokes.
 *
 * ## Ids outlive the chart
 *
 * `generateId()` is used because FEAT-0029 hangs alerts off these ids: they
 * have to survive a reload, a symbol switch, and the chart being closed
 * entirely. They are list keys, never a security token — `utils.ts` documents
 * why that distinction matters for the non-secure-context fallback.
 */

import { Decimal } from "decimal.js";

import {
    DRAWINGS_STORAGE_KEY,
    type ChartDrawing,
    type DrawingsDocument,
    type HorizontalDrawing,
    type TrendDrawing,
} from "../lib/chart/drawings/types";
import { logger } from "../services/logger";
import { safeLocalStorage } from "../utils/storageWrapper";
import { generateId } from "../utils/utils";

/** A price accepted from the UI: whatever it is, it becomes an exact decimal string. */
type PriceInput = Decimal | string | number;

function priceString(price: PriceInput): string {
    return new Decimal(price).toString();
}

/**
 * Whether a parsed object is a drawing we can render.
 *
 * Storage is a boundary, and this validates at it. The stored document is
 * editable by hand and survives across app versions, so a missing field has to
 * drop that one drawing rather than throw away the file or — worse — render a
 * line at `NaN`, which silently becomes an alert on nothing.
 */
function isDrawing(value: unknown): value is ChartDrawing {
    if (!value || typeof value !== "object") return false;
    const d = value as Partial<ChartDrawing>;
    if (typeof d.id !== "string" || !d.id) return false;
    if (typeof d.symbol !== "string" || !d.symbol) return false;

    const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
    const decimal = (s: unknown) => {
        if (typeof s !== "string") return false;
        try {
            return new Decimal(s).isFinite();
        } catch {
            return false;
        }
    };

    if (d.kind === "horizontal") return decimal((d as HorizontalDrawing).price);
    if (d.kind === "trend") {
        const t = d as TrendDrawing;
        return finite(t.fromMs) && finite(t.toMs) && decimal(t.fromPrice) && decimal(t.toPrice);
    }
    return false;
}

class DrawingStore {
    /** Every drawing, for every symbol. The chart filters; the store does not hide. */
    drawings = $state<ChartDrawing[]>([]);
    /** The drawing the trader has selected, if any. Not persisted — selection is a UI mood, not data. */
    selectedId = $state<string | null>(null);

    private loaded = false;

    /**
     * Reads the stored document. Idempotent, so the chart may call it on every
     * mount without a second chart losing the first one's work.
     */
    load(): void {
        if (this.loaded) return;
        this.loaded = true;

        const raw = safeLocalStorage.getItem(DRAWINGS_STORAGE_KEY);
        if (!raw) return;

        try {
            const parsed: unknown = JSON.parse(raw);
            const list = (parsed as DrawingsDocument)?.drawings;
            if (!Array.isArray(list)) return;
            this.drawings = list.filter(isDrawing);
        } catch (e) {
            // A corrupt file must not cost the trader their chart. Keep the
            // bad bytes on disk rather than overwriting them with `[]` — they
            // are the only copy, and a human may still want to read them.
            logger.warn(
                "chart",
                `stored drawings could not be read: ${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }

    private persist(): void {
        const doc: DrawingsDocument = { schema_version: 1, drawings: this.drawings };
        safeLocalStorage.setItem(DRAWINGS_STORAGE_KEY, JSON.stringify(doc));
    }

    /** The drawings belonging to one market, oldest first. */
    forSymbol(symbol: string): ChartDrawing[] {
        return this.drawings.filter((d) => d.symbol === symbol);
    }

    byId(id: string): ChartDrawing | null {
        return this.drawings.find((d) => d.id === id) ?? null;
    }

    addHorizontal(symbol: string, price: PriceInput, label?: string): HorizontalDrawing {
        const drawing: HorizontalDrawing = {
            kind: "horizontal",
            id: generateId(),
            symbol,
            createdAtMs: Date.now(),
            price: priceString(price),
            ...(label ? { label } : {}),
        };
        this.drawings.push(drawing);
        this.persist();
        return drawing;
    }

    addTrend(
        symbol: string,
        from: { ms: number; price: PriceInput },
        to: { ms: number; price: PriceInput },
        label?: string,
    ): TrendDrawing | null {
        // A vertical line has no level at any timestamp (`levelAt` returns
        // null for it), so it could be drawn but never read — and FEAT-0029
        // would offer an alert that can never fire. Refuse it at the door.
        if (from.ms === to.ms) return null;

        // Anchors are stored left to right so that every later reader — the
        // renderer's sampling, a future "extend right" toggle — can assume
        // `fromMs < toMs` instead of each re-deriving the order.
        const [left, right] = from.ms < to.ms ? [from, to] : [to, from];
        const drawing: TrendDrawing = {
            kind: "trend",
            id: generateId(),
            symbol,
            createdAtMs: Date.now(),
            fromMs: left.ms,
            fromPrice: priceString(left.price),
            toMs: right.ms,
            toPrice: priceString(right.price),
            ...(label ? { label } : {}),
        };
        this.drawings.push(drawing);
        this.persist();
        return drawing;
    }

    /** Moves a horizontal drawing to a new price. No-op when the id is unknown. */
    moveHorizontal(id: string, price: PriceInput): void {
        const drawing = this.byId(id);
        if (drawing?.kind !== "horizontal") return;
        drawing.price = priceString(price);
        this.persist();
    }

    /** Moves one end of a trend line, or both when the whole line is dragged. */
    moveTrend(
        id: string,
        anchors: { from?: { ms: number; price: PriceInput }; to?: { ms: number; price: PriceInput } },
    ): void {
        const drawing = this.byId(id);
        if (drawing?.kind !== "trend") return;

        const fromMs = anchors.from?.ms ?? drawing.fromMs;
        const toMs = anchors.to?.ms ?? drawing.toMs;
        // Refuse the drag that would make the line vertical rather than
        // storing a drawing that reads as `null` forever after.
        if (fromMs === toMs) return;

        if (anchors.from) {
            drawing.fromMs = anchors.from.ms;
            drawing.fromPrice = priceString(anchors.from.price);
        }
        if (anchors.to) {
            drawing.toMs = anchors.to.ms;
            drawing.toPrice = priceString(anchors.to.price);
        }
        this.persist();
    }

    remove(id: string): void {
        const next = this.drawings.filter((d) => d.id !== id);
        if (next.length === this.drawings.length) return;
        this.drawings = next;
        if (this.selectedId === id) this.selectedId = null;
        this.persist();
    }

    select(id: string | null): void {
        this.selectedId = id;
    }

    /** Test seam: drop everything in memory and on disk. */
    reset(): void {
        this.drawings = [];
        this.selectedId = null;
        this.loaded = false;
        safeLocalStorage.removeItem(DRAWINGS_STORAGE_KEY);
    }
}

export const drawingStore = new DrawingStore();
