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

import DOMPurify from 'dompurify';

// Using a simplified server-side DOM to avoid heavyweight jsdom dependency
// since we strictly only strip ALL tags and keep content.
function fallbackSanitize(text: string): string {
    if (!text) return "";
    // Remove script and style tags completely, including their content
    let cleaned = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    // Remove all remaining HTML tags, preserving inner text
    cleaned = cleaned.replace(/<[^>]+>/g, '');
    return cleaned;
}

/**
 * Sanitizes user input for storage.
 * - Strips ALL HTML tags to prevent XSS.
 * - Preserves text content (e.g. "<b>bold</b>" -> "bold").
 * - Removes script/style content entirely.
 * - Designed for Markdown-based chat where raw HTML is not needed.
 */
export function sanitizeChatInput(text: string): string {
    return fallbackSanitize(text);
}
