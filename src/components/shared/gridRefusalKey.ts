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
 * FEAT-0820 — the translation key for a refused grid action.
 *
 * The runtime answers with machine codes (`slot-conflict:…`, `invalid-state:…`)
 * and the wrappers with `internal-error`. Showing those raw tells the trader
 * nothing and hides the cause, so each one maps to a sentence. Anything not
 * listed falls back to one generic sentence; the code itself stays in the log.
 */
import type { TranslationKey } from "../../locales/schema";
export function gridRefusalKey(reason: string): TranslationKey {
  if (reason === "grid-not-found") return "botsList.grid.refusal.notFound";
  if (reason === "grid-changed") return "botsList.grid.refusal.changed";
  if (reason === "insufficient-balance") return "botsList.grid.refusal.balance";
  if (reason === "paper-trading-off") return "botsList.grid.refusal.paperOff";
  if (reason.startsWith("slot-conflict:")) return "botsList.grid.refusal.slotConflict";
  if (reason.startsWith("invalid-state:")) return "botsList.grid.refusal.state";
  if (reason === "internal-error") return "botsList.grid.refusal.internal";
  return "botsList.grid.refusal.generic";
}
