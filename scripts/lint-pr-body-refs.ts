#!/usr/bin/env -S npx tsx
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
 * Enforces both closing-reference rules on a pull request description.
 *
 * 1. Presence (BUG-0307): the description must carry exactly one closing
 *    reference, `Fixes #<own-issue>` — or an explicit `[no issue]` marker for
 *    the rare PR that genuinely links to nothing. Before this check existed,
 *    docs PRs merged with no reference at all: GitHub closed nothing while the
 *    backlog markdown said `done`, and the issues stayed open for days.
 * 2. No strays (BUG-0221): beyond that one declared reference, no other
 *    closing keyword may appear — GitHub closes every issue such a keyword
 *    points at when the PR merges.
 *
 * Reads the body from the `PR_BODY` environment variable rather than a CLI
 * argument or `${{ github.event.pull_request.body }}` interpolated directly
 * into the workflow's `run:` script — the body is untrusted external content,
 * and interpolating it into a shell command is a command-injection surface. An
 * `env:` mapping hands it to the process as data instead.
 */

import { checkBodyForStrayClosingRefs, checkBodyHasClosingRef } from "./lib/pr-issue-match";

const body = process.env.PR_BODY ?? "";

const presence = checkBodyHasClosingRef(body);
if (!presence.ok) {
    console.error(
        `❌ PR description carries no closing reference.\n`,
    );
    console.error(`
AGENTS.md requires \`Fixes #<issue>\` at the start of every PR description so
GitHub links the PR to its backlog issue and closes it on merge — a merge
without one closes nothing, and the issue silently stays open.

Add the missing line (the number of the issue this PR fixes), or, only if this
PR genuinely links to no issue at all, put \`${"[no issue]"}\` on its own line
to opt out explicitly. Silence is not an opt-out.
`);
    process.exit(1);
}

const result = checkBodyForStrayClosingRefs(body);

if (result.ok) {
    if (presence.optedOut) {
        console.log("✅ PR description opted out with `[no issue]`.");
    } else {
        console.log(`✅ PR description closes only #${presence.declared}.`);
    }
    process.exit(0);
}

console.error(
    `❌ PR description declares #${result.declared} but also closes ` +
    `${result.conflicts.map(n => `#${n}`).join(", ")}.\n`,
);
console.error(`
GitHub closes every issue a merged PR's description references with a closing
keyword — close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved, past
tense included. Only the first, #${result.declared}, was meant. Merging as-is
would also close ${result.conflicts.map(n => `#${n}`).join(" and ")}, which
this PR does not fix.

This is not hypothetical: it happened twice in one PR on 2026-08-16, once
describing a prior mistake and once quoting that description to explain it
(BUG-0221).

If the extra reference is prose *about* an issue rather than a link to it,
break the keyword instead: \`closed #<!-- -->${result.conflicts[0]}\` renders
normally and does not parse, or rephrase so no keyword sits directly before the
reference: "#${result.conflicts[0]} was affected", not "closed #${result.conflicts[0]}".
`);
process.exit(1);
