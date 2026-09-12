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
import generatedChangelogDe from "../../CHANGELOG.de.md?raw";

/**
 * Placeholder in `changelog.{de,en}.md` where the curated release notes go.
 *
 * Releases from 1.0.0 on are maintained by hand. `CHANGELOG.md` is the source
 * of truth for the English notes (and for the repo/GitHub history);
 * `CHANGELOG.de.md` mirrors the same releases in German. A parity test keeps
 * the two release lists in step.
 *
 * The surrounding localized file keeps what the notes themselves cannot
 * provide — the German and English framing around the marker.
 */
export const GENERATED_RELEASES_MARKER = "<!-- CHANGELOG_GENERATED -->";

/** Curated release notes per in-app language. */
export const RELEASE_CHANGELOGS: Record<string, string> = {
  en: generatedChangelog,
  de: generatedChangelogDe,
};

/**
 * Picks the release-notes source for a locale.
 *
 * German uses `CHANGELOG.de.md`; every other locale uses `CHANGELOG.md`. If the
 * localized source has no releases yet, fall back to English so the page is
 * never empty rather than showing a bare marker.
 */
export function releaseSourceForLocale(lang: string | undefined): string {
  const localized = RELEASE_CHANGELOGS[lang ?? "en"];
  if (localized && extractReleaseSections(localized)) {
    return localized;
  }
  return generatedChangelog;
}

/**
 * Returns the release sections of the curated changelog, without its
 * title block.
 *
 * Each release sits below the title as a heading that starts with the
 * version — `#` for a minor, `##` for a patch, the version usually wrapped
 * in a compare link. Everything from the first such heading onwards is the
 * release history.
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
 * Substitutes the curated release notes into a localized changelog document.
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
      heading({ tokens, depth, raw }: Tokens.Heading) {
        const id = slugify(raw);
        // marked v18 passes inline tokens, not pre-rendered HTML: without
        // parseInline any formatting inside a heading (links, bold, code)
        // is emitted as literal markdown source. Every generated release
        // heading carries a compare link, so this broke all of them.
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
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
  // The changelog's release notes come from a language-specific source; every
  // other content file is self-contained.
  const releaseSource = releaseSourceForLocale(currentLocale);

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
            releaseSource,
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
      releaseSource,
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
