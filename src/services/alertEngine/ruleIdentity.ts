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

import { generateId } from "../../utils/utils";

/**
 * A rule id no stored rule holds.
 *
 * `armRule` replaces by id, so a collision would not produce a duplicate — it
 * would silently overwrite an existing rule. `newAccountId` and
 * `newProviderId` guard the same way; promotion and duplication share this one
 * loop so both get the collision discipline.
 */
export function freeRuleId(taken: ReadonlySet<string>): string {
  let id = generateId();
  while (taken.has(id)) id = generateId();
  return id;
}
