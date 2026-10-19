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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { get } from "svelte/store";
import { locale } from "svelte-i18n";
import { _ } from "../locales/i18n";
import { ensureKatexCss, renderSafeMarkdown } from "../utils/markdownUtils";
import { humanizeSourceFooter } from "../lib/ai/sourceLabels";

/**
 * The assistant's markdown: `markdown`, plus the "Quellen:" footer rewritten
 * from context keys to localized words (BUG-0703).
 *
 * Separate from the generic `markdown` action on purpose — the rewrite is
 * assistant-specific, and the other consumers (flashcards, pattern views,
 * lessons) must not inherit it if they ever render foreign text.
 */
export function assistantMarkdown(node: HTMLElement, content: string) {
    let current = content;

    const render = () => {
        void ensureKatexCss();
        if (!current) {
            node.replaceChildren();
            return;
        }
        const readable = humanizeSourceFooter(current, (key) => get(_)(key));
        node.replaceChildren(renderSafeMarkdown(readable));
    };

    // The footer's words are resolved at render time, so a language switch has
    // to re-render. `subscribe` fires once on subscribe — that is the first
    // render, no separate call needed.
    const unsubscribe = locale.subscribe(render);

    return {
        update(next: string) {
            current = next;
            render();
        },
        destroy() {
            unsubscribe();
        },
    };
}
