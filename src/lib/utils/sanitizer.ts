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
import { browser } from "$app/env";

export function sanitizeHtml(dirty: string): string {
  if (!browser) return dirty; // SSR safety

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "b", "i", "em", "strong", "a", "p", "br",
      "ul", "ol", "li", "span", "div", "code", "pre", "small",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "thead", "tbody", "tr", "td", "th"
    ],
    ALLOWED_ATTR: ["href", "target", "class", "title", "alt"],
    // GlobalTracker.svelte listens for clicks document-wide and reads these
    // three attributes off any node, so an attacker-supplied one would either
    // forge an analytics event (`track-id` + `track-context`, whose JSON is
    // parsed and forwarded) or silence tracking entirely (`track-ignore`,
    // tested with `!== undefined`, so an empty value is enough).
    //
    // FORBID_ATTR rather than ALLOW_DATA_ATTR: false, because DOMPurify
    // checks it first. The other data-* attributes stay permitted — they are
    // inert for scripting and nothing should lose them to this. None of these
    // three appears in the two {@html} sinks (the legal disclaimer is app
    // i18n text, dialog messages are i18n text plus interpolated values), and
    // app-authored tracking attributes are set as literal Svelte template
    // attributes, which never pass through here.
    FORBID_ATTR: ["data-track-id", "data-track-context", "data-track-ignore"],
  });
}
