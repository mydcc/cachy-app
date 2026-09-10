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
 * Single-bot-PR routing for the backlog index step.
 *
 * A merge with a `Fixes #N` trailer produces a `bot/backlog-auto-done` PR
 * that already carries the status flip *and* a fresh index (see
 * `scripts/backlog-auto-done.mjs`). When that PR is open, the sync workflow
 * must fold its regenerated index into that branch instead of opening a
 * second `chore/backlog-index-*` PR — one bot PR per merge.
 *
 * Lives apart from the workflow bash for the same reason
 * `closed-issue-guard.ts` does: pure and unit-testable, while the workflow
 * step itself only shells out to it. The two sync workflows
 * (`sync-backlog.yml`, `sync-backlog-full.yml`) deliberately share no
 * concurrency group with the auto-done workflow — push-vs-closed event
 * order is not guaranteed (see BUG-0429) — so this decision is evaluated
 * at run time, with a short poll to cover the tie case.
 */

export type IndexPrDecision = "fold-into-auto-done" | "update-index-pr" | "create-index-pr";

/**
 * Decide where a freshly regenerated index belongs.
 *
 * - Auto-done PR open: `fold-into-auto-done` (no second PR, even if an
 *   index PR is also open — the auto-done branch wins because it carries
 *   the flip the index was generated from).
 * - Only an index PR open: `update-index-pr` (force-push in place).
 * - Neither open: `create-index-pr`.
 */
export function decideIndexPrTarget(args: {
    autoDoneOpenCount: number;
    indexOpenCount: number;
}): IndexPrDecision {
    if (args.autoDoneOpenCount > 0) return "fold-into-auto-done";
    if (args.indexOpenCount > 0) return "update-index-pr";
    return "create-index-pr";
}

// Tiny CLI so the workflow bash step stays dumb:
// `npx tsx scripts/lib/bot-pr-fold.ts <autoDoneOpen> <indexOpen>` prints
// the verdict. Not executed under vitest (argv[1] is the worker there).
import { pathToFileURL } from "node:url";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const parse = (raw: string | undefined): number => {
        const n = Number.parseInt(raw ?? "0", 10);
        return Number.isNaN(n) || n < 0 ? 0 : n;
    };
    const [autoDoneRaw, indexRaw] = process.argv.slice(2);
    console.log(
        decideIndexPrTarget({
            autoDoneOpenCount: parse(autoDoneRaw),
            indexOpenCount: parse(indexRaw),
        }),
    );
}
