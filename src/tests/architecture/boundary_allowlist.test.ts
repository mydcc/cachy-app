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
 * Architecture boundary ratchet — the allowlist must stay honest.
 *
 * `eslint.config.js` forbids new cross-layer imports, and
 * `eslint.architecture.boundaries.js` grandfathers the ones that already
 * exist. ESLint catches a file that is *missing* from the list; it cannot
 * catch the opposite: a path that was migrated but left on the list. That is
 * the quiet direction of drift — the list slowly stops describing reality, the
 * "burn-down only" contract becomes a comment nobody trusts, and the count
 * stops meaning anything.
 *
 * This test reads the allowlist and asserts every entry still earns its place:
 * it exists and it still value-imports the forbidden layer. A migrated entry
 * fails here, so removing it is part of the migration, not an afterthought.
 * Adding a *new* path is already refused by the ESLint gate — this closes the
 * other half.
 *
 * The detector is exercised against synthetic violating, type-only and clean
 * sources in the same run, so a matcher that silently stopped matching fails
 * here instead of passing vacuously.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BOUNDARIES_FILE = path.join(REPO_ROOT, "eslint.architecture.boundaries.js");

/** Strip a trailing query/hash before matching a path segment. */
function hasSegment(specifier: string, segment: string): boolean {
	return new RegExp(`(^|/)${segment}(/|$)`).test(specifier.split(/[?#]/, 1)[0]);
}

/**
 * True when `source` contains a *value* import from the given layer. Type-only
 * statements and inline `type` specifiers are imports the boundary rules allow,
 * so a file with only those is not a violation and does not belong on a list.
 */
function hasValueImportFrom(source: string, segment: "stores" | "services"): boolean {
	const flat = source.replace(/\s+/g, " ");
	const statement = /import\s+(type\s+)?[\s\S]*?\sfrom\s+["']([^"']+)["']/g;
	let match: RegExpExecArray | null;
	while ((match = statement.exec(flat))) {
		if (match[1]) continue; // `import type ...` — allowed
		if (hasSegment(match[2], segment)) return true;
	}
	// Dynamic `import("../stores/...")` also crosses the boundary.
	if (new RegExp(`import\\s*\\(\\s*["'][^"']*/${segment}(/|["'])`).test(flat)) {
		return true;
	}
	return false;
}

/** Pull a string array out of the allowlist module by its export name. */
function extractArray(text: string, exportName: string): string[] {
	const marker = `export const ${exportName} = [`;
	const start = text.indexOf(marker);
	if (start === -1) {
		throw new Error(`Could not find \`${exportName}\` in eslint.architecture.boundaries.js`);
	}
	const close = text.indexOf("];", start);
	if (close === -1) {
		throw new Error(`Unterminated array for \`${exportName}\``);
	}
	return [...text.slice(start, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const boundariesText = readFileSync(BOUNDARIES_FILE, "utf-8");
const servicesToStores = extractArray(boundariesText, "servicesToStoresAllowlist");
const utilsToServices = extractArray(boundariesText, "utilsToServicesAllowlist");

describe("architecture boundary allowlist is not stale", () => {
	it("parsed both allowlists", () => {
		// Guards against a regex that silently returns nothing and makes every
		// assertion below vacuous.
		expect(servicesToStores.length).toBeGreaterThan(0);
		expect(utilsToServices.length).toBeGreaterThan(0);
	});

	it.each(servicesToStores)(
		"%s still imports a store (else remove it from servicesToStoresAllowlist)",
		(relativePath) => {
			const file = path.join(REPO_ROOT, relativePath);
			expect(existsSync(file), `${relativePath} is listed but does not exist`).toBe(true);
			expect(
				hasValueImportFrom(readFileSync(file, "utf-8"), "stores"),
				`${relativePath} no longer value-imports stores — drop it from servicesToStoresAllowlist (burn-down only)`,
			).toBe(true);
		},
	);

	it.each(utilsToServices)(
		"%s still imports a service (else remove it from utilsToServicesAllowlist)",
		(relativePath) => {
			const file = path.join(REPO_ROOT, relativePath);
			expect(existsSync(file), `${relativePath} is listed but does not exist`).toBe(true);
			expect(
				hasValueImportFrom(readFileSync(file, "utf-8"), "services"),
				`${relativePath} no longer value-imports services — drop it from utilsToServicesAllowlist (burn-down only)`,
			).toBe(true);
		},
	);

	it("detector distinguishes value, type-only, dynamic and clean imports", () => {
		const value = `import { settingsState } from "../stores/settings.svelte";`;
		const inlineType = `import { tradeState, type Snapshot } from "../stores/trade.svelte";`;
		const typeOnly = `import type { JournalEntry } from "../stores/types";`;
		const dynamic = `const m = await import("../stores/ui.svelte");`;
		const clean = `import { parseDecimal } from "../utils/utils";`;

		expect(hasValueImportFrom(value, "stores")).toBe(true);
		expect(hasValueImportFrom(inlineType, "stores")).toBe(true);
		expect(hasValueImportFrom(dynamic, "stores")).toBe(true);
		expect(hasValueImportFrom(typeOnly, "stores")).toBe(false);
		expect(hasValueImportFrom(clean, "stores")).toBe(false);

		const svcValue = `import { logger } from "../services/logger";`;
		const svcTypeOnly = `import type { Kline } from "../services/apiService";`;
		expect(hasValueImportFrom(svcValue, "services")).toBe(true);
		expect(hasValueImportFrom(svcTypeOnly, "services")).toBe(false);
	});
});
