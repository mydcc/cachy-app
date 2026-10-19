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
 * BUG-0703 — the assistant's "Quellen:" footer listed context keys verbatim
 * (`REAL_TIME_PRICE, marketDetails.high24h, …`). The key is the stable
 * identifier the model was told to cite; the words belong to the UI.
 */

import { describe, expect, it } from "vitest";
import { humanizeSourceFooter } from "./sourceLabels";

const WORDS: Record<string, string> = {
    "assistant.sources.realTimePrice": "Echtzeitkurs",
    "assistant.sources.high24h": "24h-Hoch",
    "assistant.sources.low24h": "24h-Tief",
    "assistant.sources.fundingRate": "Funding-Rate",
    "assistant.sources.orderbook": "Orderbuch",
    "assistant.sources.marketDetails": "Marktdetails",
    "assistant.sources.confluence": "Confluence",
    "assistant.sources.divergences": "Divergenzen",
    "assistant.sources.technicals": "Technische Indikatoren",
};

const t = (key: string) => WORDS[key] ?? key;

describe("humanizeSourceFooter", () => {
    it("replaces the keys of the footer with their words", () => {
        const text = "Text.\n\n---\nQuellen: REAL_TIME_PRICE, marketDetails.high24h, marketDetails.fundingRate";

        expect(humanizeSourceFooter(text, t)).toBe(
            "Text.\n\n---\nQuellen: Echtzeitkurs, 24h-Hoch, Funding-Rate",
        );
    });

    it("keeps a key the map does not know, and falls back to the nearest parent", () => {
        // Dropping an unknown key would hide which data the model used.
        expect(
            humanizeSourceFooter(
                "Quellen: REAL_TIME_PRICE, foo.bar, marketDetails.orderbook.topBids",
                t,
            ),
        ).toBe("Quellen: Echtzeitkurs, foo.bar, Orderbuch");
    });

    it("keeps the markup the model wrapped the footer in", () => {
        expect(
            humanizeSourceFooter("<small>**Quellen:** `REAL_TIME_PRICE`</small>", t),
        ).toBe("<small>**Quellen:** Echtzeitkurs</small>");
    });

    it("handles the English footer label", () => {
        expect(humanizeSourceFooter("Sources: technicals.confluence", t)).toBe(
            "Sources: Confluence",
        );
    });

    it("collapses sources that translate to the same word", () => {
        expect(
            humanizeSourceFooter(
                "Quellen: technicals.divergences, technicals.divergences",
                t,
            ),
        ).toBe("Quellen: Divergenzen");
        // Two leaves of the same parent both read as "Orderbuch".
        expect(
            humanizeSourceFooter(
                "Quellen: marketDetails.orderbook.bids, marketDetails.orderbook.asks",
                t,
            ),
        ).toBe("Quellen: Orderbuch");
    });

    it("leaves prose alone, even when it names a key", () => {
        const prose = "Die Quellen sind wichtig.\nDer Kurs steht bei REAL_TIME_PRICE, sagt der Kontext.";
        expect(humanizeSourceFooter(prose, t)).toBe(prose);
    });
});
