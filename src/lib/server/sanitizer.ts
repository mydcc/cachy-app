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

import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const window = new JSDOM('').window;
// Cast to any to bypass strict type mismatch between JSDOM Window and DOMPurify WindowLike
const purify = DOMPurify(window as unknown as any);

/**
 * Sanitizes user input for storage.
 * - Strips ALL HTML tags to prevent XSS.
 * - Preserves text content (e.g. "<b>bold</b>" -> "bold").
 * - Removes script/style content entirely.
 * - Designed for Markdown-based chat where raw HTML is not needed.
 */
export function sanitizeChatInput(text: string): string {
    if (!text) return "";

    return purify.sanitize(text, {
        ALLOWED_TAGS: [], // Disallow all HTML tags
        KEEP_CONTENT: true, // Keep text content of stripped tags (except script/style)
        WHOLE_DOCUMENT: false,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false
    });
}
