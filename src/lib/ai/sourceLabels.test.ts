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
 * BUG-0703 — the assistant's "Quellen:" footer listed context keys verbatim.
 * The key is the stable identifier the model was told to cite; the words
 * belong to the UI. The shapes below are the ones a model actually produces.
 */

import { describe, expect, it } from "vitest";
import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";
import {
    SOURCE_LABELS,
    SOURCES_LABEL_KEY,
    contextLabelsCovered,
    humanizeSourceFooter,
} from "./sourceLabels";

const WORDS: Record<string, string> = {
    [SOURCES_LABEL_KEY]: "Quellen",
    "assistant.sources.realTimePrice": "Echtzeitkurs",
    "assistant.sources.high24h": "24h-Hoch",
    "assistant.sources.fundingRate": "Funding-Rate",
    "assistant.sources.orderbook": "Orderbuch",
    "assistant.sources.marketDetails": "Marktdetails",
    "assistant.sources.confluence": "Confluence",
    "assistant.sources.divergences": "Divergenzen",
    "assistant.sources.oscillators": "Oszillatoren",
    "assistant.sources.technicals": "Technische Indikatoren",
    "assistant.sources.pivots": "Pivot-Punkte",
};

const t = (key: string) => WORDS[key] ?? key;

describe("humanizeSourceFooter", () => {
    it("replaces the keys of the footer with their words", () => {
        const text =
            "Text.\n\n---\nQuellen: REAL_TIME_PRICE, marketDetails.high24h, marketDetails.fundingRate";

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

    it("keeps the small tag but drops bold, so no stray marker survives", () => {
        expect(
            humanizeSourceFooter("<small>**Quellen:** `REAL_TIME_PRICE`</small>", t),
        ).toBe("<small>Quellen: Echtzeitkurs</small>");
        // A bold key must not leave its opening marker behind.
        expect(
            humanizeSourceFooter("Quellen: **REAL_TIME_PRICE**, marketDetails.high24h", t),
        ).toBe("Quellen: Echtzeitkurs, 24h-Hoch");
    });

    it("uses the localized footer word, whatever the model wrote", () => {
        const english = { ...WORDS, [SOURCES_LABEL_KEY]: "Sources" };
        const tEn = (key: string) => english[key] ?? key;

        expect(humanizeSourceFooter("Quellen: REAL_TIME_PRICE", tEn)).toBe(
            "Sources: Echtzeitkurs",
        );
        expect(humanizeSourceFooter("Sources: technicals.confluence", tEn)).toBe(
            "Sources: Confluence",
        );
    });

    it("rewrites a list item and a blockquote footer", () => {
        expect(humanizeSourceFooter("- Quellen: REAL_TIME_PRICE", t)).toBe(
            "- Quellen: Echtzeitkurs",
        );
        expect(humanizeSourceFooter("> Quellen: REAL_TIME_PRICE", t)).toBe(
            "> Quellen: Echtzeitkurs",
        );
    });

    it("folds a footer the model wrapped at a comma into one line", () => {
        const wrapped =
            "Quellen: REAL_TIME_PRICE, marketDetails.high24h,\nmarketDetails.fundingRate, technicals.confluence";

        expect(humanizeSourceFooter(wrapped, t)).toBe(
            "Quellen: Echtzeitkurs, 24h-Hoch, Funding-Rate, Confluence",
        );
    });

    it("leaves a footer inside a fenced code block alone", () => {
        const sample = "```\nQuellen: REAL_TIME_PRICE, marketDetails.high24h\n```";

        expect(humanizeSourceFooter(sample, t)).toBe(sample);
    });

    it("handles a list that starts on the next line", () => {
        expect(humanizeSourceFooter("Quellen:\n- REAL_TIME_PRICE", t)).toBe(
            "Quellen: Echtzeitkurs",
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

    it("strips quotes around a key", () => {
        expect(humanizeSourceFooter('Quellen: "REAL_TIME_PRICE"', t)).toBe(
            "Quellen: Echtzeitkurs",
        );
    });

    it("leaves an empty footer alone", () => {
        const empty = "Quellen:";
        expect(humanizeSourceFooter(empty, t)).toBe(empty);
        expect(humanizeSourceFooter("Quellen: , ,", t)).toBe("Quellen: , ,");
    });

    it("leaves prose alone, including a mid-line label", () => {
        const prose =
            "Die Quellen sind wichtig.\nDer Kurs steht bei REAL_TIME_PRICE, sagt der Kontext.\nDie Quellen: REAL_TIME_PRICE";
        expect(humanizeSourceFooter(prose, t)).toBe(prose);
    });

    it("escapes a label that would otherwise act as markdown", () => {
        const hostile = { ...WORDS, [SOURCE_LABELS.REAL_TIME_PRICE]: "a*b[c]" };
        const tHostile = (key: string) => hostile[key] ?? key;

        expect(humanizeSourceFooter("Quellen: REAL_TIME_PRICE", tHostile)).toBe(
            "Quellen: a\\*b\\[c\\]",
        );
    });
});

describe("SOURCE_LABELS", () => {
    it("labels every top-level context key", () => {
        const covered = contextLabelsCovered();

        for (const key of [
            "currentTime",
            "activeSymbol",
            "REAL_TIME_PRICE",
            "priceChange24h",
            "marketDetails",
            "technicals",
            "openPositions",
            "recentHistory",
            "tradeSetup",
            "marketIntelligence",
            "latestNews",
            "portfolioStats",
        ] as const) {
            expect(covered[key]).toBeDefined();
        }
    });

    it("has no two labels with the same word, in either language", () => {
        // The footer collapses sources by label; equal words would silently
        // drop one of them.
        for (const dict of [de, en]) {
            const words = Object.entries(dict.assistant.sources)
                .filter(([key]) => key !== "label")
                .map(([, word]) => word);
            expect(new Set(words).size).toBe(words.length);
        }
    });
});
