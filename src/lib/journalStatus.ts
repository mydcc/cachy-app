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
 * The trade statuses the app itself reads or writes, as values.
 *
 * Lives in `src/lib` (not `src/stores/types`) on purpose: the architecture
 * boundaries allow every layer — services, stores, utils, components — to
 * import values from `lib`, while value imports from `stores/*` are gated.
 * `src/stores/types.ts` re-exports everything here so the `JournalEntry`
 * interface and its status vocabulary stay defined in one place.
 */
export type JournalStatus = "Won" | "Lost" | "Open" | "Planned" | "Closed";

/**
 * The statuses above, as runtime data. The union guards the type; this
 * guards storage, CSV and sync payloads, which can carry anything.
 */
export const KNOWN_JOURNAL_STATUSES: ReadonlyArray<JournalStatus> = [
  "Won",
  "Lost",
  "Open",
  "Planned",
  "Closed",
];

/**
 * Members of the union that mean the trade is over and its result is real
 * money. `Closed` is the legacy terminal status — see `coerceJournalStatus`.
 */
export const CLOSED_JOURNAL_STATUSES: ReadonlySet<JournalStatus> = new Set([
  "Won",
  "Lost",
  "Closed",
]);

/**
 * Maps an unknown status wording onto the legacy terminal `"Closed"`.
 *
 * A foreign wording — a breakeven label, a future feature's status, an
 * import's invention — represents money the counters cannot attribute.
 * Coercing it to closed routes it to the completeness checks (amount and
 * close day required, BUG-0499) instead of silently dropping it from every
 * filter that switches on the known members.
 *
 * This rewrites what the user sees on load/import: a stored `"Breakeven"`
 * comes back as `"Closed"`. That migration is deliberate — the alternative
 * is a status no counter, filter or gate understands — and it is pinned by
 * the coerce tests in `csvService_hardening.test.ts` and
 * `journal_persistence.test.ts`.
 */
export function coerceJournalStatus(value: unknown): JournalStatus {
  return (KNOWN_JOURNAL_STATUSES as ReadonlyArray<string>).includes(
    value as string,
  )
    ? (value as JournalStatus)
    : "Closed";
}
