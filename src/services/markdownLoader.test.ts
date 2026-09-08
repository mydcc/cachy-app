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

import { describe, it, expect } from "vitest";
import {
  extractReleaseSections,
  mergeGeneratedReleases,
  loadInstruction,
  GENERATED_RELEASES_MARKER,
} from "./markdownLoader";

/**
 * The in-app changelog used to be a hand-maintained copy of the release history.
 * That copy would have drifted from the moment of the first release — the app
 * would have shown a changelog that stopped at 0.94.3 forever.
 *
 * The curated `CHANGELOG.md` is now substituted into the localized document at
 * the marker, so there is nothing to keep in sync by hand. Roadmap item 11a.
 */

const CHANGELOG_TITLE_BLOCK = `# Changelog

All notable user-facing changes to Cachy, curated per release from 1.0.0
onward.`;

describe("extractReleaseSections", () => {
  it("returns nothing while the changelog holds only its title block", () => {
    // The state of CHANGELOG.md before the first automated release. The app must
    // render the localized document without an empty-looking gap of raw markers.
    expect(extractReleaseSections(CHANGELOG_TITLE_BLOCK)).toBe("");
  });

  it("drops the title block and keeps every release", () => {
    const changelog = `${CHANGELOG_TITLE_BLOCK}

# [1.1.0](https://github.com/mydcc/cachy-app/compare/v1.0.0...v1.1.0) (2026-08-05)

### Features

* **calculator:** add break-even marker ([abc1234](https://example.com))

## [1.0.1](https://github.com/mydcc/cachy-app/compare/v1.0.0...v1.0.1) (2026-08-02)

### Bug Fixes

* **orders:** preserve 19-digit order IDs ([def5678](https://example.com))`;

    const result = extractReleaseSections(changelog);

    expect(result).not.toContain("do not edit it by hand");
    expect(result.startsWith("# [1.1.0]")).toBe(true);
    expect(result).toContain("add break-even marker");
    expect(result).toContain("## [1.0.1]");
    expect(result).toContain("preserve 19-digit order IDs");
  });

  it("recognises a plain version heading, without a compare link", () => {
    // The first release has nothing to compare against, so it is written
    // unlinked.
    const changelog = `${CHANGELOG_TITLE_BLOCK}

# 1.0.0 (2026-07-30)

### Features

* first curated release`;

    expect(extractReleaseSections(changelog).startsWith("# 1.0.0")).toBe(true);
  });

  it("is not fooled by prose that merely mentions a version", () => {
    const changelog = `${CHANGELOG_TITLE_BLOCK}

Minor fixes without user impact are deliberately omitted.`;

    expect(extractReleaseSections(changelog)).toBe("");
  });
});

describe("mergeGeneratedReleases", () => {
  const localized = `# Changelog

> Note: releases are curated.

## Releases

${GENERATED_RELEASES_MARKER}`;

  it("substitutes the releases at the marker", () => {
    const merged = mergeGeneratedReleases(
      localized,
      `${CHANGELOG_TITLE_BLOCK}

# 1.0.0 (2026-07-30)

### Features

* first curated release`,
    );

    expect(merged).not.toContain(GENERATED_RELEASES_MARKER);
    expect(merged).toContain("first curated release");
    // The hand-written framing survives around it.
    expect(merged).toContain("> Note: releases are curated.");
    expect(merged.indexOf("first curated release")).toBeGreaterThan(
      merged.indexOf("## Releases"),
    );
  });

  it("removes the marker even when there is no release yet", () => {
    // Otherwise the literal HTML comment would sit in the rendered page.
    const merged = mergeGeneratedReleases(localized, CHANGELOG_TITLE_BLOCK);

    expect(merged).not.toContain(GENERATED_RELEASES_MARKER);
    expect(merged).toContain("## Releases");
  });

  it("leaves documents without the marker untouched", () => {
    const other = "# Privacy\n\nNothing to substitute here.";

    expect(mergeGeneratedReleases(other, "# 1.0.0 (2026-07-30)")).toBe(other);
  });
});

describe("loadInstruction('changelog')", () => {
  it.each(["de", "en"])(
    "renders the %s changelog with the marker resolved",
    async (lang) => {
      // End-to-end against the real content files and the real CHANGELOG.md, so
      // this fails if a translation loses the marker or the import path breaks.
      const { html } = await loadInstruction("changelog", lang);

      expect(html).not.toContain(GENERATED_RELEASES_MARKER);
      expect(html).not.toContain("CHANGELOG_GENERATED");
      expect(html).toContain("1.5.0");
      // Release headings carry compare links: the custom heading renderer
      // must parse inline formatting instead of emitting markdown source
      // (the 1.5.0 link rendered as literal "[1.5.0](...)" text before the
      // marked-v18 renderer fix).
      expect(html).toContain(
        '<a href="https://github.com/mydcc/cachy-app/compare/',
      );
    },
  );

  it("leaves an unrelated document alone", async () => {
    const { html } = await loadInstruction("privacy", "en");

    expect(html).not.toContain("CHANGELOG_GENERATED");
    expect(html.length).toBeGreaterThan(0);
  });
});
