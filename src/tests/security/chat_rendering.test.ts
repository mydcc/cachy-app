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
 * Both chat surfaces are listed. Checking only the settings tab would leave the
 * main Assistant window unguarded, which is where users actually read messages.
 * `innerHTML` is included because it is the same sink without Svelte syntax.
 */
const RENDERERS = [
  "../../components/settings/tabs/CloudTab.svelte",
  "../../lib/windows/implementations/AssistantView.svelte",
];

describe("Global Chat rendering", () => {
  it.each(RENDERERS)("%s renders chat text as text", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");

    expect(source).toContain("{msg.text}");
    expect(source).not.toContain("{@html");
    expect(source).not.toContain("innerHTML");
  });
});
