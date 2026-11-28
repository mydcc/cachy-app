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
 * Leaf event & reservation bus between `paperTradingService` / `paperExchange`
 * and `gridRuntime` (matching `botSubmissionBus.ts` so services stay out of import cycles).
 */

type GridBookChangeListener = () => void;
type GridBookResetListener = () => void;
export type GridSlotReservationCheck = (
  symbol: string,
  side: "long" | "short",
  botId?: string,
  /** Present on an add: the policy may allow it only into its own grid position. */
  positionId?: string,
) => boolean;

let listener: GridBookChangeListener | null = null;
let resetListener: GridBookResetListener | null = null;
let slotReservationCheck: GridSlotReservationCheck | null = null;

export function setGridBookChangeListener(next: GridBookChangeListener | null): void {
  listener = next;
}

export function notifyGridBookChanged(): void {
  listener?.();
}

export function setGridBookResetListener(next: GridBookResetListener | null): void {
  resetListener = next;
}

export function notifyGridBookReset(): void {
  resetListener?.();
}

export function setGridSlotReservationCheck(next: GridSlotReservationCheck | null): void {
  slotReservationCheck = next;
}

export function isGridSlotReservedForOther(
  symbol: string,
  side: "long" | "short",
  botId?: string,
  positionId?: string,
): boolean {
  return slotReservationCheck ? slotReservationCheck(symbol, side, botId, positionId) : false;
}
