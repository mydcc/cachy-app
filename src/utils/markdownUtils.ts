import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "dompurify";

// Configure marked with KaTeX support
marked.use(markedKatex({ throwOnError: false }));

/**
 * Renders Markdown to HTML with sanitization (DOMPurify).
 * Handles AI streaming artifacts (e.g. JSON blocks).
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

        // SSR Fallback: Return empty or raw (risky if displayed, but usually hydrated on client)
        return "";
    } catch (e) {
        console.error("Markdown rendering error:", e);
        return text;
    }
}
