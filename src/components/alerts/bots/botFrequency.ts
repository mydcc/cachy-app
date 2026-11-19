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

import type { FiringPolicy, TriggerFrequency } from "../../../lib/rules/types";

/**
 * FEAT-0811 — the announcement gate a firing policy needs behind it.
 *
 * `firing_policy` and `frequency` are two independent gates, and the order
 * matters. The announcement gate (`frequency`) runs first: left at its default
 * `once`, it disarms the bot after its first announcement — whether or not any
 * order was placed — and the order lane (where `firing_policy` is read) never
 * sees a second firing. A `multi` policy behind a one-shot gate is therefore
 * advertised and unreachable.
 *
 * So a `multi` bot whose gate is still one-shot gets the gate that matches:
 * `once_per_candle_close`, recurring across closed trigger candles but never
 * more than once within one. That is the conservative recurring choice — the
 * successful-entry limits stay the order lane's job, and a policy that allows
 * *deliberate* re-entries does not need an announcement on every evaluation.
 *
 * Deliberately narrow:
 * - Only `multi` promises recurrence. `once` and the default
 *   (`once_per_candle`, which the core stores as *absent*) leave the gate
 *   alone, so a bot created without touching the policy behaves exactly as a
 *   bot always has.
 * - A gate the trader already opened (`every_time`, `once_per_candle_close`)
 *   is never narrowed, and never widened beyond what they chose — including
 *   when the policy is changed back to `once`, where the policy itself caps
 *   the entries.
 *
 * Returns the frequency the document should carry; `undefined` means absent.
 */
export function frequencyFor(
  policy: FiringPolicy | undefined,
  current: TriggerFrequency | undefined,
): TriggerFrequency | undefined {
  if (policy !== "multi") return current;
  if (current === undefined || current === "once") return "once_per_candle_close";
  return current;
}
