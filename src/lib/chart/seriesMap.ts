import type { Time, LineData, HistogramData } from "lightweight-charts";

export interface ChartRow {
    time: Time;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export type SourceKind =
    | "close"
    | "open"
    | "high"
    | "low"
    | "hl2"
    | "hlc3";

/**
 * Build a Float64Array of the requested price source from aligned candle rows.
 * Used to feed the pure JSIndicators functions without them knowing about candles.
 */
export function getSourceData(rows: ChartRow[], source: SourceKind = "close"): Float64Array {
    const n = rows.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const r = rows[i];
        switch (source) {
            case "open":
                out[i] = r.open;
                break;
            case "high":
                out[i] = r.high;
                break;
            case "low":
                out[i] = r.low;
                break;
            case "hl2":
                out[i] = (r.high + r.low) / 2;
                break;
            case "hlc3":
                out[i] = (r.high + r.low + r.close) / 3;
                break;
            default:
                out[i] = r.close;
                break;
        }
    }
    return out;
}

/**
 * Zip an indicator result (index-aligned to rows) into LineData, skipping
 * non-finite values. Time is taken from the matching row so alignment is exact.
 */
export function zipToLine(values: ArrayLike<number>, rows: ChartRow[]): LineData<Time>[] {
    const out: LineData<Time>[] = [];
    const n = Math.min(values.length, rows.length);
    for (let i = 0; i < n; i++) {
        const v = values[i];
        if (typeof v === "number" && isFinite(v)) {
            out.push({ time: rows[i].time, value: v });
        }
    }
    return out;
}

/**
 * Build per-bar colored volume histogram data (up/down by candle direction).
 */
export function buildVolumeData(
    rows: ChartRow[],
    upColor: string,
    downColor: string,
): HistogramData<Time>[] {
    const out: HistogramData<Time>[] = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        out.push({
            time: r.time,
            value: r.volume,
            color: r.close >= r.open ? upColor : downColor,
        });
    }
    return out;
}
