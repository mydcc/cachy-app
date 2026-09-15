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

import { ensureKatexCss, renderSafeMarkdown } from "../utils/markdownUtils";

/**
 * Svelte Action to render Markdown with KaTeX support into an element.
 * Usage: <div use:markdown={content}></div>
 *
 * Svelte actions only run client-side, so this is the choke point that
 * guarantees KaTeX math styles for every use:markdown consumer (Assistant
 * chat, Flashcards, pattern views) — independent of loadInstruction.
 */
export function markdown(node: HTMLElement, content: string) {
    const update = (newContent: string) => {
        void ensureKatexCss();
        if (!newContent) {
            node.replaceChildren();
            return;
        }

        const rendered = renderSafeMarkdown(newContent);
        node.replaceChildren(rendered); // Works for both string (SSR fallback) and DocumentFragment
    };

    update(content);

    return {
        update,
    };
}
