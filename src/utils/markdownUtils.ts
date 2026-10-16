/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "dompurify";

// Single KaTeX registration for the global `marked` instance (FEAT-0537).
// `markdownLoader` consumes this setup via its `ensureKatexCss` import and
// must not re-register the extension.
marked.use(markedKatex({
    throwOnError: false,
    displayMode: false, // Default to inline unless $$ is used
    nonStandard: true   // Allow $ for inline math
}));

/**
 * Typographic dashes a model likes to use inside a formula, where KaTeX warns
 * about every one of them in strict mode and where a minus is meant anyway.
 */
const MATH_DASHES = /[\u2012\u2013\u2014\u2015\u2212]/g;

/**
 * Segments in which a `$` does not open math: fenced blocks, inline code,
 * display math, inline math — in that order of precedence. A `$` escaped with a
 * backslash never opens or closes a span, so `Preis \$100 – \$200` keeps its
 * typography (the span scan would otherwise rewrite plain prose).
 *
 * Known shapes this scan cannot see through, all cosmetic: an unclosed fence or
 * inline code span, double-backtick inline code, and 4-space-indented blocks.
 */
const MATH_SEGMENT =
    /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<!\\)\$[^$\n]+(?<!\\)\$)/g;

/**
 * Rewrites typographic dashes to ASCII `-` **inside math spans only**.
 *
 * KaTeX's strict mode logs `Unrecognized Unicode character "–"` for each of
 * them, which turns every assistant answer that writes a range like
 * `$BTC–USDT$` into console noise. Outside math the dash is correct typography
 * and is left alone, and code is never touched. The shapes this scan cannot see
 * through are listed at `MATH_SEGMENT`.
 */
export function normalizeMathDashes(markdown: string): string {
    return markdown.replace(MATH_SEGMENT, (segment) => {
        const isDisplayMath = segment.startsWith("$$");
        if (!isDisplayMath && !segment.startsWith("$")) return segment;
        const delimiter = isDisplayMath ? "$$" : "$";
        const inner = segment.slice(delimiter.length, -delimiter.length);
        return `${delimiter}${inner.replace(MATH_DASHES, "-")}${delimiter}`;
    });
}

/**
 * Renders Markdown to HTML with sanitization (DOMPurify).
 * Handles AI streaming artifacts (e.g. JSON blocks).
 *
 * SECURITY: Returns empty string during SSR to prevent XSS/hydration mismatches
 * from untrusted content.
 */
export function renderSafeMarkdown(text: string): string | DocumentFragment {
    try {
        if (!text) return "";

        // Hide JSON blocks that likely contain actions, even while streaming
        const cleaned = text
            .replace(/```json\s*[\s\S]*?("action"|$)[\s\S]*?(?:```|$)/g, "")
            .trim();

        const raw = marked.parse(normalizeMathDashes(cleaned)) as string;

        if (typeof window !== "undefined") {
            return DOMPurify.sanitize(raw, { RETURN_DOM_FRAGMENT: true });
        }

        // SSR Fallback: Return empty string to prevent XSS.
        return "";
    } catch (e) {
        console.error("Markdown rendering error:", e);
        return "";
    }
}

/**
 * Renders Markdown to HTML WITHOUT client-side sanitization on the server.
 * MUST ONLY BE USED FOR TRUSTED, STATIC CONTENT (e.g. internal Markdown files).
 *
 * Allows SEO content to be rendered on the server.
 */
export function renderTrustedMarkdown(text: string): string {
    try {
        if (!text) return "";

        // Hide JSON blocks (consistent behavior)
        const cleaned = text
            .replace(/```json\s*[\s\S]*?("action"|$)[\s\S]*?(?:```|$)/g, "")
            .trim();

        const raw = marked.parse(normalizeMathDashes(cleaned)) as string;

        if (typeof window !== "undefined") {
            // On client, we can still sanitize for extra safety,
            // though for trusted content it's technically optional.
            // But consistency is good.
            return DOMPurify.sanitize(raw);
        }

        // SSR: Return raw HTML because we trust the source.
        return raw;
    } catch (e) {
        console.error("Markdown rendering error:", e);
        return "";
    }
}

let katexCssPromise: Promise<unknown> | null = null;

/**
 * Injects KaTeX math styles on demand (Vite applies the CSS import as a side
 * effect). The promise is cached — safe to call from every markdown render
 * path. A failure only affects math styling, so it degrades to console.debug.
 */
export function ensureKatexCss(): Promise<unknown> {
    if (!katexCssPromise) {
        katexCssPromise = import("katex/dist/katex.min.css").catch((e: unknown) => {
            console.debug("KaTeX CSS failed to load dynamically:", e);
        });
    }
    return katexCssPromise;
}
