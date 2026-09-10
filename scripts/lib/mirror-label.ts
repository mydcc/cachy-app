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
 * Allowlist for backlog mirror labels.
 *
 * Mirror labels travel into API query strings (point lookup before any
 * create), so only exactly-shaped values pass: `backlog-id:<ID>` where the
 * ID follows the repository's item convention (letters, dash, digits).
 * Anything else returns null and the caller refuses the lookup instead of
 * sending attacker-shapable text — however trusted the source looks today.
 */

const MIRROR_LABEL_RE = /^backlog-id:([A-Z]+-\d+)$/;

/** Return the item ID for a well-shaped mirror label, else null. */
export function parseMirrorLabelId(label: string): string | null {
    const match = label.match(MIRROR_LABEL_RE);
    return match ? match[1] : null;
}
