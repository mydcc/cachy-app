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

/**
 * Markdown text helpers for the PR-description checks.
 *
 * GitHub does not autolink issue references inside code — neither fenced
 * blocks nor four-space-indented code — so the lint must not either: a PR that
 * quotes a description it is reporting on must not have the quoted `Fixes #N`
 * read as its own trailer (BUG-0431).
 */

/**
 * Remove code blocks from `text`: fenced (``` or ~~~) and indented (a tab or
 * four leading spaces), including inside a blockquote (``> ``` `` … ``> ``` ``).
 *
 * A fence line may carry an info string (```ts) on opening; the closing fence
 * must use the same character, at least as many of them as the opener, and
 * carry nothing else. An unterminated fence is stripped to the end of the
 * text: a quote the author forgot to close is still a quote, not a
 * declaration.
 */
export function stripCodeBlocks(text: string): string {
    const lines = text.split("\n");
    const kept: string[] = [];
    let open: { char: string; length: number } | null = null;
    for (const line of lines) {
        // Classify a blockquote line by its content after the `>` markers, but
        // keep the original line when it is not code. GitHub does not autolink
        // inside a fenced block quoted in a blockquote either.
        const core = line.replace(/^\s{0,3}(?:>\s?)+/, "");
        const fence = core.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
        if (open === null) {
            if (fence) {
                open = { char: fence[2][0], length: fence[2].length };
                continue;
            }
            if (/^(\t| {4,})/.test(core)) continue;
            kept.push(line);
            continue;
        }
        if (
            fence &&
            fence[2][0] === open.char &&
            fence[2].length >= open.length &&
            fence[3].trim() === ""
        ) {
            open = null;
        }
    }
    return kept.join("\n");
}
