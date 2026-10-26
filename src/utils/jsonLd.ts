/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * `JSON.stringify` for a JSON-LD block that is inserted as HTML (BUG-0727).
 *
 * A `</script>` inside any string value would terminate the surrounding
 * `<script type="application/ld+json">` and turn the rest into markup. Escaping
 * `<`, `>` and `&` as JSON unicode escapes keeps the payload byte-identical
 * after `JSON.parse` while making the sequence unrepresentable in HTML. U+2028
 * and U+2029 are escaped too because they are line terminators to some parsers.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
