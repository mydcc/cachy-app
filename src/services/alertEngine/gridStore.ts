/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
 * FEAT-0819 stage 4 — local persistence for grid bot documents and runtime state.
 *
 * Stored separately from `cachy_rules_v1` because a `GridDocument` (`kind: "grid"`)
 * is not a `RuleDocument` and must never pass through the rule parser or migrator.
 * Fail-closed on corrupt array storage (`GridStoreUnreadableError`) so a transient
 * parse failure never overwrites saved grids.
 *
 * Class A (ADR-0001): strategy and execution ledger, `localStorage` only.
 */

import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { GridDocument } from "../../lib/rules/types";
import { safeLocalStorage } from "../../utils/storageWrapper";
import { logger } from "../logger";

export const GRIDS_STORAGE_KEY = "cachy_grids_v1";
export const GRID_STATE_STORAGE_KEY = "cachy_grid_state_v1";

export type GridLifecycleStatus = "armed" | "active" | "paused" | "stopping" | "closed";
export type GridStopReason = "manual" | "stop_out";

export interface GridRuntimeRecord {
  status: GridLifecycleStatus;
  startedAt?: number;
  startedAfterFillId?: string;
  lastEvaluatedAnchorMs?: number;
  lastTrendFilter?: boolean | null;
  stopReason?: GridStopReason;
  /** Durable slot indices known to hold un-closed opening fills (survives 500-fill eviction). */
  openSlots?: number[];
}

const VALID_STATUSES = new Set<GridLifecycleStatus>([
  "armed",
  "active",
  "paused",
  "stopping",
  "closed",
]);

export class GridStoreUnreadableError extends Error {
  public readonly translationKey = "dashboard.alerts.panel.storeUnreadable";
  constructor(cause?: unknown) {
    super(`grid store is not readable${cause ? `: ${String(cause)}` : ""}`);
    this.name = "GridStoreUnreadableError";
  }
}

const listeners = new Set<() => void>();

/** Subscribe to writes on either the grid document store or runtime state ledger. */
export function subscribeGridStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitGridStoreChange(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      logger.error("alerts", "[GridStore] Listener threw on change", e);
    }
  }
}

/** Read all stored grid documents. Throws `GridStoreUnreadableError` on corrupt data. */
export function readGrids(): GridDocument[] {
  const raw = safeLocalStorage.getItem(GRIDS_STORAGE_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new GridStoreUnreadableError(e);
  }
  if (!Array.isArray(parsed)) {
    throw new GridStoreUnreadableError("stored value is not an array");
  }
  return parsed as GridDocument[];
}

export function getGrid(gridId: string): GridDocument | undefined {
  return readGrids().find((g) => g.id === gridId);
}

/**
 * Validate `document` through the Rust core and persist its canonical form.
 * Upserts by `id`. Throws if the store is unreadable or validation fails.
 */
export function saveGrid(document: GridDocument): GridDocument[] {
  const canonical = ruleSchema.validateGrid(document);
  const existing = readGrids();
  const next = existing.some((g) => g.id === canonical.id)
    ? existing.map((g) => (g.id === canonical.id ? canonical : g))
    : [...existing, canonical];
  safeLocalStorage.setItem(GRIDS_STORAGE_KEY, JSON.stringify(next));
  emitGridStoreChange();
  return next;
}

/** Remove a grid document and its runtime ledger entry by id. */
export function deleteGrid(gridId: string): boolean {
  const existing = readGrids();
  const next = existing.filter((g) => g.id !== gridId);
  if (next.length === existing.length) return false;
  safeLocalStorage.setItem(GRIDS_STORAGE_KEY, JSON.stringify(next));
  clearGridStateEntry(gridId);
  emitGridStoreChange();
  return true;
}

function normalizeRuntimeRecord(raw: unknown): GridRuntimeRecord | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const status = obj.status;
  if (typeof status !== "string" || !VALID_STATUSES.has(status as GridLifecycleStatus)) {
    return undefined;
  }
  const record: GridRuntimeRecord = { status: status as GridLifecycleStatus };
  if (typeof obj.startedAt === "number" && Number.isFinite(obj.startedAt)) {
    record.startedAt = obj.startedAt;
  }
  if (typeof obj.startedAfterFillId === "string" && obj.startedAfterFillId.length > 0) {
    record.startedAfterFillId = obj.startedAfterFillId;
  }
  if (
    typeof obj.lastEvaluatedAnchorMs === "number" &&
    Number.isFinite(obj.lastEvaluatedAnchorMs)
  ) {
    record.lastEvaluatedAnchorMs = obj.lastEvaluatedAnchorMs;
  }
  if (typeof obj.lastTrendFilter === "boolean" || obj.lastTrendFilter === null) {
    record.lastTrendFilter = obj.lastTrendFilter;
  }
  if (obj.stopReason === "manual" || obj.stopReason === "stop_out") {
    record.stopReason = obj.stopReason;
  }
  if (Array.isArray(obj.openSlots)) {
    const clean = [
      ...new Set(
        obj.openSlots.filter(
          (idx): idx is number => typeof idx === "number" && Number.isInteger(idx) && idx >= 0,
        ),
      ),
    ].sort((a, b) => a - b);
    record.openSlots = clean;
  }
  return record;
}

export function readGridStates(): Record<string, GridRuntimeRecord> {
  const raw = safeLocalStorage.getItem(GRID_STATE_STORAGE_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      logger.warn("alerts", "[GridStore] Runtime state blob is not an object; treating as empty");
      return {};
    }
    const result: Record<string, GridRuntimeRecord> = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      const normalized = normalizeRuntimeRecord(entry);
      if (normalized !== undefined) result[id] = normalized;
    }
    return result;
  } catch (e) {
    logger.warn("alerts", "[GridStore] Failed to parse runtime state blob", e);
    return {};
  }
}

export function readGridState(gridId: string): GridRuntimeRecord | undefined {
  return readGridStates()[gridId];
}

export function writeGridState(gridId: string, record: GridRuntimeRecord): void {
  const states = readGridStates();
  states[gridId] = record;
  safeLocalStorage.setItem(GRID_STATE_STORAGE_KEY, JSON.stringify(states));
  emitGridStoreChange();
}

export function patchGridState(
  gridId: string,
  patch: Partial<GridRuntimeRecord>,
): GridRuntimeRecord {
  const current = readGridState(gridId) ?? { status: "armed" as const };
  const next: GridRuntimeRecord = { ...current, ...patch };
  writeGridState(gridId, next);
  return next;
}

function clearGridStateEntry(gridId: string): boolean {
  const states = readGridStates();
  if (!(gridId in states)) return false;
  delete states[gridId];
  safeLocalStorage.setItem(GRID_STATE_STORAGE_KEY, JSON.stringify(states));
  return true;
}

export function clearGridState(gridId: string): void {
  if (clearGridStateEntry(gridId)) {
    emitGridStoreChange();
  }
}
