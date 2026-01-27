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
): Promise<InstructionContent> {
  const currentLocale = get(locale);
  const filePath = `/instructions/${name}.${currentLocale}.md`;

  try {
    // Dynamically import the markdown file content
    // Vite/SvelteKit handles this import.meta.glob for static assets
    const modules = import.meta.glob("/src/instructions/*.md", {
      query: "?raw",
      import: "default",
    });
    const modulePath = `/src${filePath}`;

    if (!modules[modulePath]) {
      throw new Error(`Markdown file not found: ${modulePath}`);
    }

    const markdownContent = (await modules[modulePath]()) as string;
    const htmlContent = await marked(markdownContent);

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
