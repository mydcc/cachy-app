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

import { Decimal } from "decimal.js";
import type { OMSPosition } from "./omsTypes";

/** Who opened a position, when the book stamped an owner (FEAT-0806). */
export interface FleetOwner {
  botId: string;
  name: string | null;
}

export type FleetSortKey = "symbol" | "owner" | "pnl" | "age";

/** `all`, `manual`, `bots` (any bot), or `bot:<id>` for one bot. */
export type FleetOwnerFilter = string;

export interface FleetRow {
  /** Unique within one list — safe as a keyed-each key. */
  key: string;
  position: OMSPosition;
  owner: FleetOwner | null;
}

/**
 * Quote-equivalent size of one position: size × mark, entry when there is no
 * mark. The single definition the account summary, the row and the fleet
 * total share, so the three cannot drift apart.
 */
export function positionNotional(position: OMSPosition): Decimal {
  return position.amount.mul(position.markPrice ?? position.entryPrice);
}

/** A resting stop for one position: where it triggers and how much it closes. */
export interface FleetStop {
  price: Decimal;
  /** Quantity the plan closes; absent means position-wide. */
  qty?: Decimal;
}

export interface FleetAggregate {
  count: number;
  totalPnl: Decimal;
  exposure: Decimal;
  openRisk: Decimal;
  unprotectedCount: number;
  unpricedCount: number;
}

function baseKey(position: OMSPosition): string {
  return position.positionId ?? `${position.symbol}|${position.side}`;
}

/**
 * Join positions with their owner and give each a key that is unique within
 * the list. A venue should never report the same id twice, but a keyed
 * `{#each}` that meets a duplicate throws, and a list that throws drops every
 * row — so uniqueness is made here instead of assumed.
 */
export function buildFleetRows(
  positions: OMSPosition[],
  owners?: Map<string, FleetOwner>,
): FleetRow[] {
  const seen = new Map<string, number>();
  return positions.map((position) => {
    const base = baseKey(position);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return {
      key: n === 0 ? base : `${base}#${n}`,
      position,
      owner: position.positionId ? (owners?.get(position.positionId) ?? null) : null,
    };
  });
}

function ownerLabel(row: FleetRow): string {
  return row.owner ? (row.owner.name ?? row.owner.botId) : "";
}

function byText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
}

/** Symbol, then key — the tie-break every sort shares, so order is total. */
function tieBreak(a: FleetRow, b: FleetRow): number {
  return byText(a.position.symbol, b.position.symbol) || byText(a.key, b.key);
}

/**
 * Sorted copy. Directions are fixed and chosen for a fleet, where the
 * question is "what needs me": symbol A→Z, owner A→Z with manual last, PnL
 * worst first (an unpriced leg last — its number is a placeholder), age
 * oldest first (no open time last).
 */
export function sortFleetRows(rows: FleetRow[], key: FleetSortKey): FleetRow[] {
  const compare = (a: FleetRow, b: FleetRow): number => {
    switch (key) {
      case "symbol":
        return tieBreak(a, b);
      case "owner": {
        if (!a.owner !== !b.owner) return a.owner ? -1 : 1;
        return byText(ownerLabel(a), ownerLabel(b)) || tieBreak(a, b);
      }
      case "pnl": {
        const ua = a.position.unpriced === true;
        const ub = b.position.unpriced === true;
        if (ua !== ub) return ua ? 1 : -1;
        return a.position.unrealizedPnl.comparedTo(b.position.unrealizedPnl) || tieBreak(a, b);
      }
      case "age": {
        const oa = a.position.openedAt;
        const ob = b.position.openedAt;
        if ((oa === undefined) !== (ob === undefined)) return oa === undefined ? 1 : -1;
        return (oa ?? 0) - (ob ?? 0) || tieBreak(a, b);
      }
    }
  };
  return [...rows].sort(compare);
}

export function filterFleetRows(rows: FleetRow[], filter: FleetOwnerFilter): FleetRow[] {
  if (filter === "all") return rows;
  if (filter === "manual") return rows.filter((r) => r.owner === null);
  if (filter === "bots") return rows.filter((r) => r.owner !== null);
  if (filter.startsWith("bot:")) {
    const botId = filter.slice(4);
    return rows.filter((r) => r.owner?.botId === botId);
  }
  return [];
}

/**
 * Book totals, all `Decimal`. Computed over the rows it is given — the caller
 * passes the whole book, not the filtered view, so the figures describe the
 * account and do not change with a filter.
 *
 * Open risk is the loss if each position's stop fills from its entry:
 * `|entry − stop| × size` on the losing side, floored at zero once a stop has
 * moved past entry. A position with no stop contributes nothing and is
 * counted in `unprotectedCount` — a bare sum would read as "covered" while
 * hiding exactly the positions with no cap. A partially covered position
 * counts as unprotected too, and only its covered quantity enters the sum.
 */
export function aggregateFleet(
  rows: FleetRow[],
  stopFor: (position: OMSPosition) => FleetStop | undefined,
): FleetAggregate {
  let totalPnl = new Decimal(0);
  let exposure = new Decimal(0);
  let openRisk = new Decimal(0);
  let unprotectedCount = 0;
  let unpricedCount = 0;

  for (const { position: p } of rows) {
    if (p.unpriced) unpricedCount += 1;
    else totalPnl = totalPnl.plus(p.unrealizedPnl);

    exposure = exposure.plus(positionNotional(p));

    const stop = stopFor(p);
    if (stop === undefined) {
      unprotectedCount += 1;
      continue;
    }
    // A partial plan protects only the quantity it closes; pricing the whole
    // position at its trigger would understate the uncapped remainder.
    const covered = stop.qty !== undefined ? Decimal.min(stop.qty, p.amount) : p.amount;
    if (covered.lt(p.amount)) unprotectedCount += 1;
    const perUnit = p.side === "long" ? p.entryPrice.minus(stop.price) : stop.price.minus(p.entryPrice);
    if (perUnit.gt(0)) openRisk = openRisk.plus(perUnit.mul(covered));
  }

  return { count: rows.length, totalPnl, exposure, openRisk, unprotectedCount, unpricedCount };
}

export interface FleetOwnerOption {
  /** A `FleetOwnerFilter` value. */
  value: FleetOwnerFilter;
  kind: "all" | "manual" | "bots" | "bot";
  /** Display name for `kind: "bot"`; null when the rule was deleted. */
  name: string | null;
  count: number;
}

/**
 * The choices an owner filter can offer for this book — empty when no
 * position is bot-owned, because "manual only" over an all-manual book is a
 * control that does nothing. Built from the rows, so a bot with no open
 * position is not offered and a closed bot's option disappears with it.
 */
export function ownerFilterOptions(rows: FleetRow[]): FleetOwnerOption[] {
  const botRows = rows.filter((r) => r.owner !== null);
  if (botRows.length === 0) return [];
  const manualCount = rows.length - botRows.length;

  const perBot = new Map<string, { name: string | null; count: number }>();
  for (const { owner } of botRows) {
    if (!owner) continue;
    const entry = perBot.get(owner.botId) ?? { name: owner.name, count: 0 };
    entry.count += 1;
    perBot.set(owner.botId, entry);
  }

  const options: FleetOwnerOption[] = [{ value: "all", kind: "all", name: null, count: rows.length }];
  if (manualCount > 0) options.push({ value: "manual", kind: "manual", name: null, count: manualCount });
  options.push({ value: "bots", kind: "bots", name: null, count: botRows.length });
  for (const [botId, { name, count }] of perBot) {
    options.push({ value: `bot:${botId}`, kind: "bot", name, count });
  }
  return options;
}
