/*
 * Copyright (C) 2026 MYDCT
 *
 * Sanitization Utility
 * Wraps DOMPurify to prevent XSS in standard components.
 */

import DOMPurify from "dompurify";
import { browser } from "$app/environment";

export function sanitizeHtml(dirty: string): string {
  if (!browser) return dirty; // SSR safety

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "b", "i", "em", "strong", "a", "p", "br",
      "ul", "ol", "li", "span", "div", "code", "pre", "small",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "table", "thead", "tbody", "tr", "td", "th"
    ],
    ALLOWED_ATTR: ["href", "target", "class", "style", "title", "alt"]
  });
}
