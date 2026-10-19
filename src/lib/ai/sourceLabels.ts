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

import type { AiContext } from "../../stores/ai.svelte";
import type { TranslationKey } from "../../locales/schema";

/**
 * The context keys the assistant is told to cite in its "Quellen:" footer
 * (`safetyRules` rule 2). Keys stay stable identifiers — the label is
 * localized at render time (BUG-0703) — and a key the map does not know is
 * shown verbatim, so a reader can always see which data the model named.
 */
export const SOURCE_LABELS = {
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
} satisfies Record<string, TranslationKey>;

/** The footer's own word follows the UI language, like the labels after it. */
export const SOURCES_LABEL_KEY: TranslationKey = "assistant.sources.label";

/**
 * Compile-time guard: every top-level context key needs a label, or the footer
 * shows a raw key again the day `AiContext` grows a field. `error` is not a
 * data source and is excluded on purpose.
 */
type ContextKey = Exclude<keyof AiContext, "error">;

/**
 * Exported so the test can call it and the type checker can check it: the
 * assignment fails to compile as soon as a context key has no label.
 */
export function contextLabelsCovered(): Record<ContextKey, TranslationKey> {
    return SOURCE_LABELS;
}

/** A fenced code block is content, not a footer: a sample must stay a sample. */
const FENCE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;

/**
 * The footer head: an optional list or quote marker, optional `<small>`,
 * optional bold, then the word and the colon. The rest of the line is the list.
 */
const SOURCES_HEAD =
    /^([ \t]*(?:[-*+>]\s*)?(?:<small>\s*)?(?:\*\*)?)(Quellen|Sources)(\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*)([^\n]*)$/;

/** A wrapped footer ends its line at a comma; the list continues below. */
const WRAP_TAIL = /,\s*$/;

/** A leaf the map does not name falls back to its nearest known parent. */
function labelFor(key: string): TranslationKey | undefined {
    const exact = SOURCE_LABELS[key as keyof typeof SOURCE_LABELS];
    if (exact) return exact;
    const parts = key.split(".");
    for (let i = parts.length - 1; i > 0; i -= 1) {
        const parent = SOURCE_LABELS[parts.slice(0, i).join(".") as keyof typeof SOURCE_LABELS];
        if (parent) return parent;
    }
    return undefined;
}

/**
 * Strips the decoration a model likes to put around a key.
 */
function cleanToken(token: string): string {
    return token
        .trim()
        .replace(/^[`"'*]+|[`"'*]+$/g, "")
        .trim();
}

/**
 * Escapes the markdown metacharacters a label could contain. Today every label
 * is a plain word, but the labels are spliced into markdown before it is
 * parsed, so anything that could start a link, emphasis or HTML is neutralized
 * rather than trusted.
 */
function escapeLabel(label: string): string {
    return label.replace(/([\\*_[\]<>#|])/g, "\\$1");
}

/**
 * Rewrites one footer block: the head line plus any continuation lines the
 * model wrapped at a comma.
 */
function rewriteBlock(
    lines: string[],
    translate: (key: TranslationKey) => string,
): string[] {
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
        const head = SOURCES_HEAD.exec(lines[i]);
        if (!head) {
            out.push(lines[i]);
            continue;
        }

        let list = head[4];
        let end = i;
        // A footer whose list is a bullet list on the following lines.
        if (list.trim() === "") {
            while (end + 1 < lines.length && /^[ \t]*[-*+]\s+\S/.test(lines[end + 1])) {
                end += 1;
                const item = lines[end].trim().replace(/^[-*+]\s+/, "");
                list = list.trim() ? `${list.trim()} ${item}` : item;
            }
        }
        // A list the model wrapped at a comma.
        while (WRAP_TAIL.test(list) && end + 1 < lines.length && lines[end + 1].trim() !== "") {
            end += 1;
            list += " " + lines[end].trim();
        }

        // A footer that ends in `</small>` keeps that tag outside the list.
        const close = /^(.*?)(\s*<\/small>\s*)$/s.exec(list);
        const body = close ? close[1] : list;
        const suffix = close ? close[2] : "";

        const seen = new Set<string>();
        const labels: string[] = [];
        for (const raw of body.split(",")) {
            const key = cleanToken(raw);
            if (!key) continue;
            const labelKey = labelFor(key);
            const label = escapeLabel(labelKey ? translate(labelKey) : key);
            if (seen.has(label)) continue;
            seen.add(label);
            labels.push(label);
        }

        if (labels.length === 0) {
            out.push(lines[i]);
            continue;
        }

        const lead = head[1].replace(/\*\*/g, "");
        const between = head[3].replace(/\*\*/g, "");
        const bridge = /\s$/.test(between) ? between : `${between} `;
        out.push(`${lead}${translate(SOURCES_LABEL_KEY)}${bridge}${labels.join(", ")}${suffix}`);
        i = end;
    }
    return out;
}

/**
 * Rewrites the keys in the "Quellen:"/"Sources:" footer to localized words.
 *
 * Handles the shapes a model actually produces: a leading list or quote
 * marker, `<small>` and bold wrappers, and a list wrapped over several lines at
 * a comma. Fenced code is left untouched. Unknown keys stay verbatim — hiding
 * one would hide which data the model used.
 */
export function humanizeSourceFooter(
    text: string,
    translate: (key: TranslationKey) => string,
): string {
    return text
        .split(FENCE)
        .map((part, index) => (
            index % 2 === 1 ? part : rewriteBlock(part.split("\n"), translate).join("\n")
        ))
        .join("");
}
