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
 * Link-header pagination for the GitHub REST API.
 *
 * `fetchAllIssues` used to stop when a page held fewer than `per_page`
 * entries — a short page with HTTP 200 during API degradation looked
 * exactly like a last page, so the run continued with a truncated listing
 * and created duplicates for every invisible item. The `Link` header does
 * not lie that way: keep following `rel="next"` until it is gone, whatever
 * each page holds.
 */

/**
 * Return the `rel="next"` URL from an RFC 5988 `Link` header, or null when
 * there is no next page (missing/empty/unparseable header included — a
 * missing header on a full-shaped response simply ends the walk).
 */
export function nextPageUrl(linkHeader: string | null | undefined): string | null {
    if (!linkHeader) return null;
    for (const part of linkHeader.split(",")) {
        const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
        if (match && match[2] === "next") return match[1];
    }
    return null;
}
