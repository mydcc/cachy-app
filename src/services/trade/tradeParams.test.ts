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
 * Contract for the order parameter shapes (FEAT-0342 slice 1).
 *
 * `tradeParams.ts` is a type-only module — every importer uses
 * `import type`, so the shapes themselves cannot be exercised at runtime.
 * What this file pins is the property the header promises: the module
 * must export **no runtime values**, so no runtime edge exists toward
 * `orderGate` or `decimal.js` consumers. A runtime export (a helper, a
 * constant, a re-exported value) turns this red.
 *
 * The shapes' own invariants live where they are enforceable: `origin`
 * being required (BUG-0494) is checked by `svelte-check` over the
 * production importers plus the provenance suites in
 * `orderGate.test.ts` and `tradeService.paperProvenance.test.ts` — a
 * `@ts-expect-error` here would prove nothing, because `*.test.ts`
 * files are excluded from the typecheck.
 */

import { describe, expect, it } from "vitest";
import * as tradeParams from "./tradeParams";

describe("trade param contracts", () => {
    it("exports no runtime values (stays type-only)", () => {
        expect(Object.keys(tradeParams)).toEqual([]);
    });
});
