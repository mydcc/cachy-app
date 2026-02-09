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

import { marked } from "marked";
import markedKatex from "marked-katex-extension";
import DOMPurify from "isomorphic-dompurify";
import { locale } from "../locales/i18n";
import { get } from "svelte/store";

// Helper to slugify text for heading IDs
const slugify = (text: string) => {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/^#+\s+/, "")
      // Remove symbols but keep letters (including Unicode), numbers, and spaces
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      // Replace spaces with a single hyphen
      .replace(/\s+/g, "-")
      // Collapse multiple hyphens
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
};

// Register KaTeX extension and Heading ID logic
marked.use(
  markedKatex({
    throwOnError: false,
    displayMode: false,
    nonStandard: true
  }),
  {
    renderer: {
      heading(args: any) {
        const { text, depth, raw } = args;
        const id = slugify(raw);
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
    } as any,
  },
);

interface InstructionContent {
  html: string;
  title: string;
}

export async function loadInstruction(
  name:
    | "dashboard"
    | "journal"
    | "changelog"
    | "guide"
    | "privacy"
    | "whitepaper",
  lang?: string
): Promise<InstructionContent> {
  const currentLocale = lang || get(locale);
  // Path relative to project root for module lookup
  const relativePath = `/src/lib/assets/content/${name}.${currentLocale}.md`;

  try {
    // Dynamically import the markdown file content
    // Vite/SvelteKit handles this import.meta.glob for static assets
    const modules = import.meta.glob("/src/lib/assets/content/*.md", {
      query: "?raw",
      import: "default",
    });

    // In import.meta.glob, keys are exactly as the pattern matches or relative.
    // Usually with leading slash if absolute path provided.
    // Let's rely on the exact string.

    if (!modules[relativePath]) {
      // Fallback or specific error handling if file doesn't exist for locale
      console.warn(`Markdown file not found: ${relativePath}`);
      if (currentLocale !== 'en') {
        // Try fallback to 'en'
        const fallbackPath = `/src/lib/assets/content/${name}.en.md`;
        if (modules[fallbackPath]) {
          const content = (await modules[fallbackPath]()) as string;
          const html = await marked(content);
          const firstLine = content.split("\n")[0];
          const titleMatch = firstLine.match(/^#\s*(.*)/);
          return { html, title: titleMatch ? titleMatch[1] : "" };
        }
      }
      throw new Error("markdownErrors.fileNotFound");
    }

    const markdownContent = (await modules[relativePath]()) as string;
    const rawHtml = await marked(markdownContent);
    const htmlContent = DOMPurify.sanitize(rawHtml);

    // Extract title from the first line (assuming it's an H1)
    const firstLine = markdownContent.split("\n")[0];
    const titleMatch = firstLine.match(/^#\s*(.*)/);
    const title = titleMatch ? titleMatch[1] : "";

    return { html: htmlContent, title: title };
  } catch (error) {
    console.error(
      `Failed to load or parse markdown for ${name} in ${currentLocale}:`,
      error,
    );
    return { html: `<p>Error loading instructions.</p>`, title: "Error" };
  }
}
