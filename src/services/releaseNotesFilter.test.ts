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
  filterUserFacingReleases,
  isInternalBullet,
  normalizeBullet,
  parseBulletPrefix,
} from "./releaseNotesFilter";

describe("parseBulletPrefix", () => {
  it("reads bold type and scope", () => {
    expect(parseBulletPrefix("* **fix(exchange):** closes 400s")).toEqual({
      type: "fix",
      scope: "exchange",
    });
  });

  it("reads a bare scope without a type", () => {
    expect(parseBulletPrefix("* **security:** sanitize icons")).toEqual({
      type: "security",
      scope: "",
    });
  });

  it("reads an unbolded conventional prefix", () => {
    expect(parseBulletPrefix("* fix(ui): snaps back")).toEqual({
      type: "fix",
      scope: "ui",
    });
  });

  it("returns null for prose bullets", () => {
    expect(parseBulletPrefix("* quiz closes after every answer")).toBeNull();
  });
});

describe("isInternalBullet", () => {
  it.each([
    "* **ci:** fix permission name in sync workflow",
    "* **chore:** regenerate backlog artifacts",
    "* fix(ci): auto back-merge main into develop",
    "* disable commitlint body-max-line-length rule",
    "* satisfy ESLint no-explicit-any and no-unused-vars",
    "* dispatch ready backlog items to Jules automatically",
    "* stop /jules-review from duplicating what CI already reports",
    "* **security:** suppress unsanitized HTML warnings via eslint-disable",
    "* **webgpu:** optimize arraybuffer mapping to typedarray conversion",
    "* **repair:** resolve N+1 API call pattern in ATR repair",
  ])("drops internal work: %s", (line) => {
    expect(isInternalBullet(line)).toBe(true);
  });

  it.each([
    "* **security:** sanitize HTML injection in MarketOverview icons",
    "* **security:** prevent CryptoPanic API key leak in error logs",
    "* **ui:** prevent symbol input from snapping back when cleared",
    "* replace shared APP_ACCESS_TOKEN with self-issued client tokens (BUG-0052)",
    "* academy content unreachable on a phone",
    "* token issuance rate limit locks out visitors behind a reverse proxy",
    "* **smc:** sort orderblocks to fix mitigation sweep logic",
  ])("keeps user-visible changes: %s", (line) => {
    expect(isInternalBullet(line)).toBe(false);
  });
});

describe("normalizeBullet", () => {
  it("treats duplicates differing only in hash, issue link or closes refs as equal", () => {
    const first =
      "* **ui:** prevent symbol input from snapping back ([51f1e9c](https://example.com/commit/51f1e9c))";
    const second =
      "* **ui:** prevent symbol input from snapping back ([#1820](https://example.com/issues/1820)) ([8c7d0e2](https://example.com/commit/8c7d0e2))";
    const third =
      "* **ui:** prevent symbol input from snapping back ([540b921](https://example.com/commit/540b921)), closes [#1820](https://example.com/issues/1820)";

    expect(normalizeBullet(second)).toBe(normalizeBullet(first));
    expect(normalizeBullet(third)).toBe(normalizeBullet(first));
  });
});

describe("filterUserFacingReleases", () => {
  it("drops prerelease sections, duplicates and internal bullets", () => {
    const sections = `# [1.5.0](https://example.com/compare/v1.4.0...v1.5.0) (2026-08-12)

### Bug Fixes

* **ui:** prevent symbol input from snapping back ([51f1e9c](https://example.com/commit/51f1e9c))
* **ui:** prevent symbol input from snapping back ([540b921](https://example.com/commit/540b921))
* **ci:** fix permission name in sync workflow ([7caa5d7](https://example.com/commit/7caa5d7))

# [1.5.0-beta.1](https://example.com/compare/v1.4.0...v1.5.0-beta.1) (2026-08-11)

### Bug Fixes

* **ui:** prevent symbol input from snapping back ([51f1e9c](https://example.com/commit/51f1e9c))`;

    const result = filterUserFacingReleases(sections);

    expect(result).toContain("# [1.5.0]");
    expect(result).not.toContain("beta");
    expect(result).not.toContain("**ci:**");
    // The duplicated symbol-input fix survives exactly once.
    expect(result.match(/prevent symbol input/g)?.length).toBe(1);
  });

  it("removes sections and versions left empty by filtering", () => {
    const sections = `# [1.1.1](https://example.com/compare/v1.1.0...v1.1.1) (2026-08-02)

### Bug Fixes

* **ci:** auto back-merge main into develop ([180c284](https://example.com/commit/180c284))

# [1.1.0](https://example.com/compare/v1.0.0...v1.1.0) (2026-08-01)

### Features

* **calculator:** add break-even marker ([abc1234](https://example.com/commit/abc1234))

### Bug Fixes

* fix(ci): lint only the tip commit ([d8f239d](https://example.com/commit/d8f239d))`;

    const result = filterUserFacingReleases(sections);

    expect(result).not.toContain("1.1.1");
    expect(result).toContain("add break-even marker");
    // The emptied Bug Fixes subsection of 1.1.0 is gone, Features survives.
    expect(result).not.toContain("### Bug Fixes");
    expect(result).toContain("### Features");
  });

  it("strips closes references but keeps compare and commit links", () => {
    const sections = `# [1.2.0](https://example.com/compare/v1.1.0...v1.2.0) (2026-08-09)

### Bug Fixes

* correct percent-vs-fraction scaling for REST funding rate ([d3cdaf9](https://example.com/commit/d3cdaf9)), closes [#1658](https://example.com/issues/1658)`;

    const result = filterUserFacingReleases(sections);

    expect(result).not.toContain("closes");
    expect(result).toContain("[d3cdaf9](https://example.com/commit/d3cdaf9)");
    expect(result).toContain("https://example.com/compare/v1.1.0...v1.2.0");
  });
});
