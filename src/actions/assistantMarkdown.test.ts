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
 * action, so a helper that is tested but not called would leave the footer as
 * keys. These tests go through the real action and the real locale files.
 */

import { afterEach, describe, expect, it } from "vitest";
import { waitLocale } from "svelte-i18n";
import { setLocale } from "../locales/i18n";
import { assistantMarkdown } from "./assistantMarkdown";

afterEach(() => setLocale("en"));

describe("assistantMarkdown action", () => {
    it("renders the assistant's source footer as words, not keys", async () => {
        setLocale("en");
        await waitLocale("en");

        const node = document.createElement("div");
        assistantMarkdown(node, "Check: BTCUSDT.\n\n---\nQuellen: REAL_TIME_PRICE, marketDetails.high24h");

        expect(node.querySelector("p")?.textContent).toContain("Sources: Real-time price, 24h high");
        expect(node.textContent).not.toContain("REAL_TIME_PRICE");
        expect(node.textContent).not.toContain("marketDetails.high24h");
        // Still real markdown around it: the rule and the paragraph.
        expect(node.querySelector("hr")).not.toBeNull();
    });

    it("uses the German labels when the UI language is German", async () => {
        setLocale("de");
        await waitLocale("de");

        const node = document.createElement("div");
        assistantMarkdown(node, "Check.\n\nQuellen: REAL_TIME_PRICE, marketDetails.high24h");

        expect(node.textContent).toContain("Quellen: Echtzeitkurs, 24h-Hoch");
    });

    it("re-renders the footer when the language changes", async () => {
        setLocale("en");
        await waitLocale("en");

        const node = document.createElement("div");
        assistantMarkdown(node, "Quellen: REAL_TIME_PRICE");
        expect(node.textContent).toContain("Sources: Real-time price");

        setLocale("de");
        await waitLocale("de");

        // The action subscribes to the locale; without that this stays English.
        expect(node.textContent).toContain("Quellen: Echtzeitkurs");
    });

    it("leaves a code sample that shows the keys untouched", async () => {
        setLocale("en");
        await waitLocale("en");

        const node = document.createElement("div");
        assistantMarkdown(node, "```\nQuellen: REAL_TIME_PRICE\n```");

        expect(node.textContent).toContain("REAL_TIME_PRICE");
    });
});
