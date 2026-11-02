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

/*
 * FEAT-0771 — window rules the load path had to discard.
 *
 * A rule stored for a window type that has left the target list cannot apply
 * any more, so the sanitiser drops it. Correct for the model, silent for the
 * user: the settings section shows fewer rules than they created. This module
 * carries that one fact from the load path to the editor.
 *
 * Deliberately a leaf: it imports nothing from the settings store, so the
 * window layer keeps its one-way dependency (`windowRuleSource.ts` is the
 * other bridge). The report is transient by design — once the load path has
 * saved the surviving rules, there is nothing left to report on the next
 * start, and a persisted dismissal would also suppress a future, different
 * trim.
 */

let droppedTypes = $state<readonly string[]>([]);

/** Called by the settings load path through `WINDOW_RULE_DROP_WIRE_KEY`. */
export function noteDroppedWindowRuleTypes(types: readonly string[]): void {
  droppedTypes = types.length > 0 ? [...types] : [];
}

/** The user has read the notice; it must not come back this session. */
export function dismissDroppedWindowRuleTypes(): void {
  droppedTypes = [];
}

export const windowRuleDrops = {
  /** Window types whose stored rules the last load discarded. */
  get types(): readonly string[] {
    return droppedTypes;
  },
};
