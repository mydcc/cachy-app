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

import type { Condition } from "../rules/types";

/**
 * The one condition a draft carries, unwrapped from the group the panel may
 * have put it in.
 *
 * Every single-condition builder needs this and none of them can tell from the
 * draft whether the wrapper is there: `setSingleCondition` may store a bare
 * condition or a one-element group depending on how the draft was seeded. A
 * tab that reads `draft.conditions.kind` directly sees `"group"`, concludes the
 * draft holds nothing of its own, and silently drops a pattern or a price the
 * trader had already chosen — which looks like the panel forgetting, not like a
 * missing unwrap.
 *
 * Shared rather than repeated per tab (FEAT-0394 hit it second, after
 * FEAT-0390) so the next builder inherits the answer instead of the trap.
 *
 * `null` for a real combo: more than one condition is not this tab's to render,
 * and picking `of[0]` would show a fragment of a rule as if it were the rule.
 */
export function soleCondition(
  conditions: Condition | null | undefined,
): Condition | null {
  if (!conditions) return null;
  if (conditions.kind !== "group") return conditions;
  return conditions.of.length === 1 ? conditions.of[0] : null;
}
