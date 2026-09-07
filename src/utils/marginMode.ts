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
 * Every margin-mode spelling, reduced to one of two values (or empty).
 *
 * Bitunix spells it `ISOLATION`, the position mapper lowercases whatever
 * arrives, and Bitget would say `isolated`. Matching the common prefix beats
 * keeping three spellings in step.
 *
 * Shared rather than duplicated because the comparison now happens in two
 * places that must agree: the chip decides what to *show*, and the post-write
 * read-back decides whether the venue has *applied* what was written
 * (BUG-0409). Two copies of this rule drifting apart would make a confirmed
 * write look unconfirmed.
 */
export function normalizeMarginMode(value: unknown): "" | "isolation" | "cross" {
    const text = String(value ?? "").toLowerCase();
    if (!text) return "";
    return text.startsWith("isolat") ? "isolation" : "cross";
}
