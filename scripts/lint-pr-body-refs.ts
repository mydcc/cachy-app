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
 * Rejects a pull request description that closes more than the issue it
 * declares.
 *
 * `scripts/lint-commit-refs.mjs` (BUG-0220) covers commit messages, where no
 * closing keyword is ever legitimate — the link belongs in the PR description
 * instead, per `CLAUDE.md`. That leaves the description itself unchecked, and
 * it is exactly where the rule was broken twice on the same day, in the pull
 * request written to fix the first incident: `Fixes #<own-issue>` at the top,
 * followed later by prose using a past-tense keyword in passing (BUG-0221).
 *
 * The rule here is narrower than "no closing keyword at all", because
 * `CLAUDE.md` requires exactly one: `Fixes #<own-issue>` is expected and
 * accounted for. `checkBodyForStrayClosingRefs` treats the first closing
 * reference as that declaration and only rejects a *second, different* one.
 *
 * Reads the body from the `PR_BODY` environment variable rather than a CLI
 * argument or `${{ github.event.pull_request.body }}` interpolated directly
 * into the workflow's `run:` script — the body is untrusted external content,
 * and interpolating it into a shell command is a command-injection surface. An
 * `env:` mapping hands it to the process as data instead.
 */

import { checkBodyForStrayClosingRefs } from "./lib/pr-issue-match";

const body = process.env.PR_BODY ?? "";
const result = checkBodyForStrayClosingRefs(body);

if (result.ok) {
    console.log(
        result.declared === null
            ? "✅ PR description carries no closing reference. (Separate concern: CLAUDE.md still requires one.)"
            : `✅ PR description closes only #${result.declared}.`,
    );
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
