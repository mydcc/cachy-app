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

/**
 * Source scanning for the settings persistence guards.
 *
 * Both guards match identifiers in a source file, so they have to see code and
 * nothing else — a `showSidebars:` inside a comment or a string is not a write.
 *
 * The first implementation was five chained regex replacements, literals before
 * comments so that a `//` inside a URL string would not eat the rest of the
 * line. That ordering is only safe in one direction, and it fails on the other:
 * an apostrophe in a comment — `the user's choice` — opens a "string" that runs
 * until the *next* apostrophe, possibly across lines, and takes real code with
 * it. Measured on `settings.svelte.ts`: 61% of the file blanked, 1,205 of
 * 2,054 content lines emptied. Across `src`, 9 real `settingsState.<key> =`
 * write sites in 4 files became invisible to the save-side guard.
 *
 * There is no ordering that fixes this, because whether a quote is a delimiter
 * or a character depends on what came before it. So this walks the source once,
 * tracking state, and the order of the characters in the file decides
 * everything. Newlines survive so line numbers in failures still line up.
 */

export function stripNonCode(text: string): string {
  const out: string[] = [];
  let i = 0;
  const n = text.length;

  /** Copy `count` characters through as blanks, keeping any newline. */
  const blank = (count: number) => {
    for (let k = 0; k < count; k += 1) out.push(text[i + k] === "\n" ? "\n" : " ");
  };

  while (i < n) {
    const c = text[i];

    // Line comment.
    if (c === "/" && text[i + 1] === "/") {
      let j = i;
      while (j < n && text[j] !== "\n") j += 1;
      blank(j - i);
      i = j;
      continue;
    }

    // Block comment, including JSDoc.
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const j = end < 0 ? n : end + 2;
      blank(j - i);
      i = j;
      continue;
    }

    // HTML comment, which Svelte templates carry.
    if (c === "<" && text.startsWith("<!--", i)) {
      const end = text.indexOf("-->", i + 4);
      const j = end < 0 ? n : end + 3;
      blank(j - i);
      i = j;
      continue;
    }

    // String or template literal. A template is taken whole: a `${...}`
    // expression in this codebase never contains a settings write, and
    // tracking nested braces would mean re-implementing the language.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === quote) {
          j += 1;
          break;
        }
        if (text[j] === "\n" && quote !== "`") {
          // Unterminated single- or double-quoted string. Stopping at the
          // newline is what keeps one stray quote from blanking the file; the
          // regex version ran to the next quote anywhere in the rest of it.
          break;
        }
        j += 1;
      }
      blank(j - i);
      i = j;
      continue;
    }

    out.push(c);
    i += 1;
  }

  return out.join("");
}

/**
 * Body of the method whose signature line matches `signature`, by brace depth.
 *
 * Strips comments and literals first, because counting braces on raw source
 * stops at the first `}` inside a comment or a string. Callers want the code,
 * and making that the only way to ask for it removes the footgun.
 */
export function methodBody(source: string, signature: RegExp): string {
  const lines = stripNonCode(source).split("\n");
  const start = lines.findIndex((line) => signature.test(line));
  if (start < 0) throw new Error(`method not found: ${signature}`);
  let depth = 0;
  for (let i = start; i < lines.length; i += 1) {
    for (const char of lines[i]) {
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
    }
    if (depth === 0 && i > start) return lines.slice(start, i + 1).join("\n");
  }
  throw new Error(`unbalanced braces from line ${start + 1}`);
}