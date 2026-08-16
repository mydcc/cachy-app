#!/usr/bin/env node
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
 * Rejects GitHub closing keywords in commit messages.
 *
 * Issue linking belongs in the pull request description — `CLAUDE.md` and
 * `AGENTS.md` require `Fixes #<issue>` there, and that is enough to close the
 * issue and advance the Kanban card. A closing keyword in a *commit* message is
 * never needed here, and it is dangerous: GitHub's squash merge concatenates
 * every commit message in the PR into the merge commit body, so any one of them
 * can close an issue nobody meant to touch.
 *
 * That is not theoretical. On 2026-08-16 a commit body quoting a mis-link, in
 * order to document it, closed an unrelated unfixed P1 (BUG-0220). The same
 * mistake was then made twice more within the hour, including in the pull
 * request written to prevent it — the keyword set includes the past tense, so
 * "it closed #1234" reads as description and parses as an instruction.
 *
 * Usage:
 *   node scripts/lint-commit-refs.mjs <base>..<head>
 *   git log --format=%B -3 | node scripts/lint-commit-refs.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * GitHub's documented closing keywords, every tense.
 *
 * The scan that missed the third instance used `(Fixes|Closes|Resolves)` and
 * so read straight past `closed #2002`. A check narrower than the thing it
 * checks is worse than no check, because it is believed.
 */
const KEYWORDS = [
    "close", "closes", "closed",
    "fix", "fixes", "fixed",
    "resolve", "resolves", "resolved",
];

// GitHub also accepts owner/repo#123 and full issue URLs. Matching the bare
// `#123` form plus the cross-repo form covers what can appear here.
const PATTERN = new RegExp(
    `\\b(${KEYWORDS.join("|")})\\b\\s*:?\\s+((?:[\\w.-]+\\/[\\w.-]+)?#\\d+|https?:\\/\\/github\\.com\\/[\\w.-]+\\/[\\w.-]+\\/issues\\/\\d+)`,
    "gi",
);

function readMessages() {
    const range = process.argv[2];
    if (range) {
        // %x00 separates commits; %B alone would run them together.
        const out = execFileSync(
            "git",
            ["log", "--no-merges", "--format=%H%x1f%B%x00", range],
            { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
        );
        return out
            .split("\0")
            .map(chunk => chunk.trim())
            .filter(Boolean)
            .map(chunk => {
                const [sha, ...rest] = chunk.split("\x1f");
                return { sha: sha.trim().slice(0, 8), message: rest.join("\x1f") };
            });
    }

    let stdin = "";
    try {
        stdin = readFileSync(0, "utf8");
    } catch {
        stdin = "";
    }
    return stdin.trim() ? [{ sha: "(stdin)", message: stdin }] : [];
}

const commits = readMessages();
const offenders = [];

for (const { sha, message } of commits) {
    for (const match of message.matchAll(PATTERN)) {
        offenders.push({ sha, phrase: match[0].replace(/\s+/g, " ").trim() });
    }
}

if (offenders.length === 0) {
    console.log(`✅ ${commits.length} commit message(s) checked, no closing keywords found.`);
    process.exit(0);
}

console.error("❌ Closing keyword found in a commit message.\n");
for (const { sha, phrase } of offenders) {
    console.error(`   ${sha}  "${phrase}"`);
}
console.error(`
GitHub parses these in commit messages, not just PR descriptions, and a squash
merge folds every commit message in the PR into the merge body. Any one of them
can close an issue this change does not fix.

Put the link in the pull request description instead — that is what CLAUDE.md
requires and it is enough to close the issue and move the Kanban card.

If the commit needs to write *about* a reference rather than make one:
  - break the keyword:            Fixes #<!-- -->1770
  - or keep it away from the position directly before the reference:
                                  "#1770 was shut in error"   ✅
                                  "closed #1770 in error"     ❌ still links

The keyword set is ${KEYWORDS.join(", ")} — the past tense counts.
`);
process.exit(1);
