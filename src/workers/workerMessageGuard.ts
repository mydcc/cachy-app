/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Entry validation for the two Web Workers (BUG-0725).
 *
 * Worker entry points are a trust boundary of their own: a malformed
 * `postMessage` from any same-origin script (or a bug in the caller) reaches
 * code that assumes arrays, ids and klines exist. The check lives here rather
 * than in the worker file so it can be tested without emulating `self`.
 *
 * The caps are deliberately far above what the service sends — the technicals
 * history is trimmed to 750 candles and a journal is user data — but low
 * enough that a hostile or broken caller cannot turn one message into an
 * unbounded allocation.
 */

export const MAX_WORKER_POINTS = 50_000;
export const MAX_AGGREGATOR_JOURNAL = 50_000;

const SERIES_KEYS = ["times", "opens", "highs", "lows", "closes", "volumes"] as const;
const KLINE_KEYS = ["time", "open", "high", "low", "close", "volume"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberSeries(value: unknown): value is ArrayLike<number> {
  // Deliberately not `ArrayBuffer.isView`: DataView is a view with no length
  // and no indexed elements, so it would pass the length checks by accident.
  const isSeries =
    Array.isArray(value) ||
    value instanceof Float64Array ||
    value instanceof Float32Array;
  if (!isSeries) return false;
  const series = value as ArrayLike<number>;
  if (series.length > MAX_WORKER_POINTS) return false;
  for (let i = 0; i < series.length; i++) {
    if (typeof series[i] !== "number" || !Number.isFinite(series[i])) return false;
  }
  return true;
}

/** All six SoA arrays present, finite, same length, and within the cap. */
function hasAlignedSeries(payload: Record<string, unknown>): boolean {
  let length: number | null = null;
  for (const key of SERIES_KEYS) {
    const value = payload[key];
    if (!isNumberSeries(value)) return false;
    if (length === null) length = value.length;
    else if (value.length !== length) return false;
  }
  return length !== null;
}

function isKlineRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const key of KLINE_KEYS) {
    const field = value[key];
    if (typeof field !== "number" || !Number.isFinite(field)) return false;
  }
  return true;
}

/**
 * The legacy path accepts Decimal-shaped strings as well as numbers, because
 * the worker constructs `new Decimal(k.open)` from either.
 */
function isLegacyKline(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.time !== "number" || !Number.isFinite(value.time)) return false;
  for (const key of ["open", "high", "low", "close", "volume"] as const) {
    const field = value[key];
    const isNumber = typeof field === "number" && Number.isFinite(field);
    if (!isNumber && typeof field !== "string") return false;
  }
  return true;
}

export type GuardedTechnicalsType = "CALCULATE" | "INITIALIZE" | "UPDATE" | "CLEANUP";

export interface GuardedTechnicalsMessage {
  type: GuardedTechnicalsType;
  payload: Record<string, unknown>;
  id?: string;
}

const TECHNICALS_TYPES = new Set<GuardedTechnicalsType>([
  "CALCULATE",
  "INITIALIZE",
  "UPDATE",
  "CLEANUP",
]);

/**
 * Returns the message the technicals worker may process, or `null`.
 *
 * `INITIALIZE` and `UPDATE` require an id because the worker's cache is keyed
 * by it; `CALCULATE` and `CLEANUP` may run without one.
 */
export function readTechnicalsWorkerMessage(
  data: unknown,
): GuardedTechnicalsMessage | null {
  if (!isRecord(data) || typeof data.type !== "string") return null;
  const type = data.type as GuardedTechnicalsType;
  if (!TECHNICALS_TYPES.has(type)) return null;

  const id = typeof data.id === "string" && data.id.length > 0 ? data.id : undefined;
  if ((type === "INITIALIZE" || type === "UPDATE") && id === undefined) return null;

  const payload = data.payload === undefined ? {} : data.payload;
  if (!isRecord(payload)) return null;

  if (type === "CALCULATE") {
    // The service has two shapes: SoA typed arrays or a legacy kline array.
    if (payload.times !== undefined) {
      if (!hasAlignedSeries(payload)) return null;
    } else if (
      !Array.isArray(payload.klines) ||
      payload.klines.length > MAX_WORKER_POINTS ||
      !payload.klines.every(isLegacyKline)
    ) {
      return null;
    }
  }

  if (type === "INITIALIZE") {
    if (!hasAlignedSeries(payload)) return null;
    if ((payload.times as ArrayLike<number>).length === 0) return null;
  }

  if (type === "UPDATE" && !isKlineRecord(payload.kline)) return null;

  return { type, payload, id };
}

export interface GuardedAggregatorMessage {
  journal: unknown[];
  id?: string;
}

/** Returns the journal analysis message, or `null` for a malformed one. */
export function readAggregatorWorkerMessage(
  data: unknown,
): GuardedAggregatorMessage | null {
  if (!isRecord(data)) return null;
  if (!Array.isArray(data.journal)) return null;
  if (data.journal.length > MAX_AGGREGATOR_JOURNAL) return null;
  const id = typeof data.id === "string" && data.id.length > 0 ? data.id : undefined;
  return { journal: data.journal, id };
}
