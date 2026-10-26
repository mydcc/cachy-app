/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * BUG-0726: chat text is remote input and must never be rendered as HTML.
 *
 * The current renderer uses `{msg.text}`, which escapes. This test exists so a
 * future "let messages contain links" change cannot silently introduce stored
 * XSS in the one place remote text is displayed.
 */
describe("Global Chat rendering", () => {
  it("renders message text through interpolation, not an HTML directive", () => {
    const source = readFileSync(
      new URL(
        "../../components/settings/tabs/CloudTab.svelte",
        import.meta.url,
      ),
      "utf8",
    );

    const start = source.indexOf('class="cloud-log"');
    const end = source.indexOf("</div>", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const chatLog = source.slice(start, end + "</div>".length);
    expect(chatLog).toContain("{msg.text}");
    expect(chatLog).not.toContain("{@html");
  });
});
