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

import type { TranslationKey } from "../../locales/schema";

/**
 * The context keys the assistant is told to cite in its "Quellen:" footer
 * (`safetyRules` rule 2). Keys stay stable identifiers — the display names are
 * localized at render time (BUG-0703). That keeps the footnote verifiable
 * ("did it cite a real key?") while the reader gets words instead of
 * `marketDetails.high24h`.
 */
export const SOURCE_LABELS: Record<string, TranslationKey> = {
  currentTime: "assistant.sources.currentTime",
  activeSymbol: "assistant.sources.activeSymbol",
  REAL_TIME_PRICE: "assistant.sources.realTimePrice",
  priceChange24h: "assistant.sources.priceChange24h",
  marketDetails: "assistant.sources.marketDetails",
  "marketDetails.currentPrice": "assistant.sources.currentPrice",
  "marketDetails.high24h": "assistant.sources.high24h",
  "marketDetails.low24h": "assistant.sources.low24h",
  "marketDetails.volume24h": "assistant.sources.volume24h",
  "marketDetails.fundingRate": "assistant.sources.fundingRate",
  "marketDetails.nextFunding": "assistant.sources.nextFunding",
  "marketDetails.orderbook": "assistant.sources.orderbook",
  technicals: "assistant.sources.technicals",
  "technicals.summary": "assistant.sources.technicalsSummary",
  "technicals.confluence": "assistant.sources.confluence",
  "technicals.divergences": "assistant.sources.divergences",
  "technicals.oscillators": "assistant.sources.oscillators",
  "technicals.movingAverages": "assistant.sources.movingAverages",
  "technicals.pivots": "assistant.sources.pivots",
  "technicals.pivots.classic": "assistant.sources.pivots",
  "technicals.volatility": "assistant.sources.volatility",
  "technicals.higherTimeframe": "assistant.sources.higherTimeframe",
  tradeSetup: "assistant.sources.tradeSetup",
  openPositions: "assistant.sources.openPositions",
  recentHistory: "assistant.sources.recentHistory",
  portfolioStats: "assistant.sources.portfolioStats",
  marketIntelligence: "assistant.sources.marketIntelligence",
  latestNews: "assistant.sources.latestNews",
};

/**
 * The footer line: `Quellen:` or `Sources:`, optionally wrapped in `<small>`
 * and/or bold. Anchored to the start of a line so a key that appears inside a
 * sentence (rule 1 forbids it anyway) is never rewritten.
 */
const SOURCES_LINE =
    /^([ \t]*(?:<small>\s*)?(?:\*\*)?(?:Quellen|Sources)\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*)([^\n]+?)((?:\*\*)?(?:\s*<\/small>)?[ \t]*)$/gm;

/**
 * A leaf the map does not name falls back to its nearest known parent, so
 * `marketDetails.orderbook.topBids` reads as "Orderbuch" instead of breaking
 * the sentence with a raw path.
 */
function labelFor(key: string): TranslationKey | undefined {
    const exact = SOURCE_LABELS[key];
    if (exact) return exact;
    const parts = key.split(".");
    for (let i = parts.length - 1; i > 0; i -= 1) {
        const parent = SOURCE_LABELS[parts.slice(0, i).join(".")];
        if (parent) return parent;
    }
    return undefined;
}

/** Strips the markdown decoration a model likes to put around a key. */
function cleanToken(token: string): string {
    return token
        .trim()
        .replace(/^`+|`+$/g, "")
        .replace(/^\*+|\*+$/g, "")
        .trim();
}

/**
 * Rewrites the keys in the "Quellen:"/"Sources:" footer to localized words.
 *
 * Unknown keys are kept verbatim: dropping one would hide which data the model
 * actually used, and that is the part a reader may want to check. Everything
 * outside that one line is left untouched.
 */
export function humanizeSourceFooter(
    text: string,
    translate: (key: TranslationKey) => string,
): string {
    return text.replace(SOURCES_LINE, (_match, prefix: string, list: string, suffix: string) => {
        const seen = new Set<string>();
        const labels: string[] = [];
        for (const raw of list.split(",")) {
            const key = cleanToken(raw);
            if (!key) continue;
            const labelKey = labelFor(key);
            const label = labelKey ? translate(labelKey) : key;
            if (seen.has(label)) continue;
            seen.add(label);
            labels.push(label);
        }
        return labels.length > 0 ? `${prefix}${labels.join(", ")}${suffix}` : _match;
    });
}
