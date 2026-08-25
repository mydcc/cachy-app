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
 * Turning back-log front-matter identities into values the GitHub Issues API
 * accepts.
 *
 * Lives apart from `sync-github-issues.ts` for the same reason
 * `pr-issue-match.ts` does: the sync script exits at import time without
 * `GITHUB_TOKEN`, so nothing in it can be unit-tested. See BUG-0307.
 */

export interface AssigneeSanitization {
    /** Logins GitHub will accept on an issue. */
    valid: string[];
    /**
     * Front-matter values that are not assignable collaborators. They stay in
     * the markdown as provenance (who did the work) but must never reach the
     * API: GitHub validates the `assignees` array against repository
     * collaborators and rejects the *entire* request on one unknown value —
     * which is how `state: closed`, labels and title were lost together for
     * every item claiming `assignee: jules` (BUG-0307).
     */
    invalid: string[];
}

/**
 * Split front-matter assignees into API-safe logins and everything else.
 *
 * Matching is case-insensitive because front matter spells agents loosely
 * (`jules`, `Jules`) while GitHub logins have a canonical casing. Empty
 * strings and placeholder values are dropped rather than sent.
 */
export function sanitizeAssignees(
    assignees: readonly string[] | undefined,
    assignableLogins: ReadonlySet<string>,
): AssigneeSanitization {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const raw of assignees ?? []) {
        const login = raw.trim();
        if (!login || login.toLowerCase() === "none") continue;

        let matched = false;
        for (const assignable of assignableLogins) {
            if (assignable.toLowerCase() === login.toLowerCase()) {
                // Use GitHub's own casing so repeated PATCHes stay byte-stable
                // and the "already in sync" skip logic keeps working.
                valid.push(assignable);
                matched = true;
                break;
            }
        }
        if (!matched) invalid.push(login);
    }

    return { valid, invalid };
}
