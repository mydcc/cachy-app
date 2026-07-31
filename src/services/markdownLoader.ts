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

import { marked, type Tokens } from "marked";
import markedKatex from "marked-katex-extension";
import { locale } from "../locales/i18n";
import { get } from "svelte/store";
import generatedChangelog from "../../CHANGELOG.md?raw";

/**
 * Placeholder in `changelog.{de,en}.md` where the generated release notes go.
 *
 * Releases from 1.0.0 on are produced by semantic-release from Conventional
 * Commit messages into `CHANGELOG.md`. That file is the single source of truth
 * for them: nobody hand-copies entries into the in-app changelog, so the two can
 * never disagree.
 *
 * The surrounding localized file keeps what a machine cannot write — the German
 * and English framing, and the hand-maintained 0.9x history. The generated part
 * is English only, because commit messages are English by project convention;
 * the note above the marker says so in the reader's language.
 */
export const GENERATED_RELEASES_MARKER = "<!-- CHANGELOG_GENERATED -->";

/**
 * Returns the release sections of a semantic-release changelog, without its
 * title block.
 *
 * semantic-release writes the configured `changelogTitle` at the top and inserts
 * each new release below it, as a heading that starts with the version — `#` for
 * a minor, `##` for a patch, the version usually wrapped in a compare link.
 * Everything from the first such heading onwards is the release history.
 *
 * Returns an empty string before the first release, when the file is only its
 * title block.
 */
export function extractReleaseSections(changelog: string): string {
  const lines = changelog.split("\n");
  const firstRelease = lines.findIndex((line) =>
    /^#{1,3}\s+\[?\d+\.\d+\.\d+/.test(line),
  );

  return firstRelease === -1 ? "" : lines.slice(firstRelease).join("\n").trim();
}

/**
 * Substitutes the generated release notes into a localized changelog document.
 *
 * A document without the marker is returned untouched, so the other content
 * files are unaffected.
 */
export function mergeGeneratedReleases(
  localized: string,
  changelog: string,
): string {
  if (!localized.includes(GENERATED_RELEASES_MARKER)) return localized;

  return localized.replace(
    GENERATED_RELEASES_MARKER,
    extractReleaseSections(changelog),
  );
}

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
      heading({ text, depth, raw }: Tokens.Heading) {
        const id = slugify(raw);
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
    },
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
          const content = mergeGeneratedReleases(
            (await modules[fallbackPath]()) as string,
            generatedChangelog,
          );
          const html = await marked(content);
          const firstLine = content.split("\n")[0];
          const titleMatch = firstLine.match(/^#\s*(.*)/);
          return { html, title: titleMatch ? titleMatch[1] : "" };
        }
      }
      throw new Error("markdownErrors.fileNotFound");
    }

    const markdownContent = mergeGeneratedReleases(
      (await modules[relativePath]()) as string,
      generatedChangelog,
    );
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
