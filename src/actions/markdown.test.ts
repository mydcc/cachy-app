// @vitest-environment happy-dom
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * BUG-0703 — the wiring, not just the mapping: the chat renders through this
 * action, so a helper that is tested but not called would leave the footer
 * as keys. This test goes through the real action and the real locale file.
 */

import { describe, expect, it } from "vitest";
import { waitLocale } from "svelte-i18n";
import { markdown } from "./markdown";

describe("markdown action", () => {
    it("renders the assistant's source footer as words, not keys", async () => {
        await waitLocale("en");

        const node = document.createElement("div");
        markdown(node, "Check: BTCUSDT.\n\n---\nQuellen: REAL_TIME_PRICE, marketDetails.high24h");

        expect(node.textContent).toContain("Real-time price");
        expect(node.textContent).toContain("24h high");
        expect(node.textContent).not.toContain("REAL_TIME_PRICE");
        expect(node.textContent).not.toContain("marketDetails.high24h");
    });
});
