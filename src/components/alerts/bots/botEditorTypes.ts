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

/**
 * FEAT-0811 — the shared types of the bot editor's sections.
 *
 * A types-only module on purpose: the sections and their host exchange these
 * shapes, and a type import compiles away, so this file never becomes an
 * edge in the import graph the architecture ratchet freezes.
 */

import type { EntryTriggerMode, FiringPolicy } from "../../../lib/rules/types";

/**
 * The firing section's state as the inputs hold it: every limit a string
 * ("" means absent, the document's default), the selects carrying the
 * document's own vocabulary.
 */
export interface BotFiringState {
    policy: FiringPolicy | undefined;
    maxPositions: string;
    maxEntriesPerDay: string;
    maxRiskPerPosition: string;
    budgetCap: string;
    entryTrigger: EntryTriggerMode | undefined;
}
