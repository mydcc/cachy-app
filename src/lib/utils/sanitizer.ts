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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Sanitization Utility
 * Wraps DOMPurify to prevent XSS in standard components.
 */

import DOMPurify from "dompurify";
import { browser } from "$app/environment";

const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    "b", "i", "em", "strong", "a", "p", "br",
    "ul", "ol", "li", "span", "div", "code", "pre", "small",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "thead", "tbody", "tr", "td", "th"
  ],
  ALLOWED_ATTR: ["href", "target", "class", "style", "title", "alt"]
};

/**
 * Sanitizes HTML to prevent XSS in client-side components.
 * SSR is globally disabled (ssr=false), so the non-browser path
 * only runs during prerendering where no component HTML is rendered.
 * Server-side routes use $lib/server/sanitizer instead.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  if (!browser) return ""; // Safe: SSR disabled, prerender only generates shell
  return DOMPurify.sanitize(dirty, SANITIZE_OPTIONS);
}
