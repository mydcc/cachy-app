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
import DOMPurify from "isomorphic-dompurify";

// Configure marked with KaTeX support
marked.use(markedKatex({
    throwOnError: false,
    displayMode: false, // Default to inline unless $$ is used
    nonStandard: true   // Allow $ for inline math
}));

/**
 * Renders Markdown to HTML with sanitization (DOMPurify).
 * Handles AI streaming artifacts (e.g. JSON blocks).
 *
 * SECURITY: Returns empty string during SSR to prevent XSS/hydration mismatches
 * from untrusted content.
 */
export function renderSafeMarkdown(text: string): string {
    try {
        if (!text) return "";

        // Hide JSON blocks that likely contain actions, even while streaming
        const cleaned = text
            .replace(/```json\s*[\s\S]*?("action"|$)[\s\S]*?(?:```|$)/g, "")
            .trim();

        const raw = marked.parse(cleaned) as string;

        if (typeof window !== "undefined") {
            return DOMPurify.sanitize(raw);
        }

        // SSR Fallback: Return empty string to prevent XSS.
        return "";
    } catch (e) {
        console.error("Markdown rendering error:", e);
        return text;
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

        const raw = marked.parse(cleaned) as string;

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
