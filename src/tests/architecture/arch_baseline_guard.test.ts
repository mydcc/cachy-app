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

// @vitest-environment node

/*
 * BUG-0799 — the half of the ratchet that needs the base branch.
 *
 * `cycle_ratchet.test.ts` proves the tree matches its own baseline. Both files
 * travel in the same commit, so that test cannot distinguish a burn-down from a
 * baseline raised by hand to make a regression pass. `scripts/arch-baseline-guard.mjs`
 * reads the baseline from the merge base; these tests pin what it counts as
 * "looser", including the two shapes that must *not* be a failure: a burndown,
 * and a cycle that re-anchored because a file was renamed.
 */

import { describe, expect, it } from "vitest";
import { compareBaselineRatchet } from "../../../scripts/arch-baseline-guard.mjs";

describe("the base-branch guard refuses a baseline raised by hand", () => {
	const base = {
		static: {
			sccs: [{ size: 8, sample: "src/lib/appAuth.ts" }],
			uphillPairs: { "services->stores": 113, "lib->stores": 41 },
		},
		lazy: { uphillPairs: { "lib->services": 1 } },
		combined: { sccs: [{ size: 197, sample: "src/components/alerts/bots/BotIntentEditor.svelte" }] },
	};

	const clone = () => JSON.parse(JSON.stringify(base));

	it("passes an unchanged baseline", () => {
		expect(compareBaselineRatchet(clone(), base, "origin/develop")).toEqual([]);
	});

	it("fails a raise even though the tree matches its own baseline", () => {
		// The case the unit test above cannot see: the number moved with the
		// change it was supposed to gate.
		const raised = clone();
		raised.static.uphillPairs["services->stores"] = 114;

		const failures = compareBaselineRatchet(raised, base, "origin/develop");
		expect(failures.some((line: string) => line.includes("rose from 113 to 114"))).toBe(true);
	});

	it("fails a new uphill pair frozen into the baseline", () => {
		const raised = clone();
		raised.static.uphillPairs["lib->components"] = 7;

		const failures = compareBaselineRatchet(raised, base, "origin/develop");
		expect(failures.some((line: string) => line.includes("was not in the baseline"))).toBe(true);
	});

	it("fails a cycle written into the baseline", () => {
		const raised = clone();
		raised.static.sccs.push({ size: 3, sample: "src/services/new.ts" });

		const failures = compareBaselineRatchet(raised, base, "origin/develop");
		expect(failures.some((line: string) => line.includes("frozen cycle mass rose"))).toBe(true);
	});

	it("allows a burn-down", () => {
		const lower = clone();
		lower.static.uphillPairs["services->stores"] = 100;
		lower.static.sccs = [];

		expect(compareBaselineRatchet(lower, base, "origin/develop")).toEqual([]);
	});

	it("allows a cycle that re-anchored without changing size", () => {
		// An SCC's anchor is its alphabetically first member, so a renamed file
		// moves the anchor. Comparing anchors instead of mass would call that a
		// regression and teach everyone to ignore the gate.
		const renamed = clone();
		renamed.static.sccs = [{ size: 8, sample: "src/lib/appAuthRenamed.ts" }];

		expect(compareBaselineRatchet(renamed, base, "origin/develop")).toEqual([]);
	});

	it("refuses to compare against something that is not a baseline", () => {
		const failures = compareBaselineRatchet(base, {}, "an empty file");
		expect(failures.some((line: string) => line.includes("is not a baseline"))).toBe(true);
	});
});
