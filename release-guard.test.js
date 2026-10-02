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

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

const { execFileSync } = await import("node:child_process");
const { parseTags, highestOnLine, listTags, default: guard } = await import(
  "./release-guard.js"
);

/** Pretend `git tag --list` printed these. */
function gitHasTags(...tags) {
  execFileSync.mockReturnValue(tags.join("\n"));
}

const logger = { log: vi.fn() };

/** Runs the guard the way semantic-release does, from verifyRelease. */
function verifyRelease(tags, version) {
  gitHasTags(...tags);
  return guard.verifyRelease({ nextRelease: { version }, logger });
}

describe("release-version-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseTags", () => {
    it("keeps only tags that are valid semver behind a v prefix", () => {
      expect(parseTags(["v1.6.0-beta.364", "nightly", "v2", "1.6.0"])).toEqual([
        { tag: "v1.6.0-beta.364", version: "1.6.0-beta.364" },
        { tag: "1.6.0", version: "1.6.0" },
      ]);
    });
  });

  describe("highestOnLine", () => {
    it("compares by semver, not by digit order, so beta.9 loses to beta.10", () => {
      const tags = parseTags(["v1.6.0-beta.9", "v1.6.0-beta.10"]);
      expect(highestOnLine(tags, "beta").tag).toBe("v1.6.0-beta.10");
    });

    it("compares across base versions, because a newer minor has the same claim", () => {
      const tags = parseTags(["v1.6.0-beta.364", "v1.7.0-beta.1"]);
      expect(highestOnLine(tags, "beta").tag).toBe("v1.7.0-beta.1");
    });

    it("does not treat a stable tag as a bound on the beta line", () => {
      const tags = parseTags(["v1.6.0", "v1.6.0-beta.364"]);
      expect(highestOnLine(tags, "beta").tag).toBe("v1.6.0-beta.364");
    });

    it("treats a beta tag as no bound at all on the stable line", () => {
      const tags = parseTags(["v1.6.0", "v1.6.0-beta.364"]);
      expect(highestOnLine(tags, undefined).tag).toBe("v1.6.0");
    });

    it("returns null when the line is empty, so a first release is not blocked", () => {
      expect(highestOnLine(parseTags(["v1.6.0-beta.364"]), undefined)).toBeNull();
    });

    it("matches a numerically-named prerelease line, which semver reports as a number", () => {
      // `semver.prerelease("1.6.0-1.beta")` is `[1, "beta"]` — a number. Compared
      // raw it never equals the string "1", so the tag would drop out of the
      // line and the guard would pass without having seen it.
      const tags = parseTags(["v1.6.0-1.alpha", "v1.6.0-1.beta"]);
      expect(highestOnLine(tags, "1").tag).toBe("v1.6.0-1.beta");
    });
  });

  describe("which hook it runs from", () => {
    // Regression guard. `publish` looks right — it is the obvious hook for
    // "do not publish this" — and it is wrong: semantic-release creates and
    // pushes the tag before it (index.js:208 and :210 against :215), so a
    // guard there stops the run only after the bad tag is on the remote.
    // `prepare` is wrong too, because @semantic-release/git pushes inside it
    // (lib/prepare.js:78). See the phase table in release-guard.js.
    it("runs from verifyRelease, before any commit, tag or push", () => {
      expect(Object.keys(guard)).toContain("verifyRelease");
      expect(Object.keys(guard)).not.toContain("publish");
      expect(Object.keys(guard)).not.toContain("prepare");
      expect(Object.keys(guard)).not.toContain("success");
    });

    it("does not throw when the caller passes no logger", () => {
      gitHasTags("v1.6.0-beta.364");
      expect(() =>
        guard.verifyRelease({ nextRelease: { version: "1.6.0-beta.365" } }),
      ).not.toThrow();
    });
  });

  describe("releasing a beta", () => {
    const existing = ["v1.6.0-beta.363", "v1.6.0-beta.364", "v1.5.0"];

    it("refuses 1.6.0-beta.1, the version this guard was written for", () => {
      expect(() => verifyRelease(existing, "1.6.0-beta.1")).toThrow(
        /not above v1\.6\.0-beta\.364/,
      );
    });

    it("refuses the version that is already published, one revision later", () => {
      expect(() => verifyRelease([...existing, "v1.6.0-beta.1"], "1.6.0-beta.1")).toThrow();
    });

    it("refuses a lower counter on a newer base version", () => {
      expect(() => verifyRelease([...existing, "v1.7.0-beta.2"], "1.7.0-beta.1")).toThrow();
    });

    it("allows the next counter, which is what the channel fix produces", () => {
      expect(() => verifyRelease(existing, "1.6.0-beta.365")).not.toThrow();
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining("1.6.0-beta.365 is above v1.6.0-beta.364"),
      );
    });

    it("allows the first beta of a line that has never been released", () => {
      expect(() => verifyRelease(["v1.5.0"], "1.6.0-beta.1")).not.toThrow();
    });
  });

  describe("releasing a stable version", () => {
    it("refuses a stable version that has already been released", () => {
      expect(() =>
        verifyRelease(["v1.5.0", "v1.6.0", "v1.6.0-beta.364"], "1.6.0"),
      ).toThrow(/not above v1\.6\.0/);
    });

    it("allows a stable version above the stable tags, whatever the betas say", () => {
      expect(() => verifyRelease(["v1.5.0", "v1.6.0-beta.364"], "1.6.0")).not.toThrow();
    });
  });

  describe("when the checkout has no tags", () => {
    it("refuses to release, because it cannot prove the version is new", () => {
      expect(() => verifyRelease([], "1.6.0-beta.365")).toThrow(/no semver tags found/);
    });

    it("refuses when the tags are all something other than semver", () => {
      expect(() => verifyRelease(["nightly", "latest"], "1.6.0-beta.365")).toThrow(
        /no semver tags found/,
      );
    });
  });

  describe("listTags", () => {
    it("asks git for the v-prefixed tags it created", () => {
      gitHasTags("v1.0.0");
      expect(listTags()).toEqual(["v1.0.0"]);
      expect(execFileSync).toHaveBeenCalledWith("git", ["tag", "--list", "v*"], {
        encoding: "utf8",
        cwd: undefined,
      });
    });

    // The guard reads the tags of the repository it was asked about. Relying on
    // process.cwd() works only because index.js:259 defaults context.cwd to it;
    // a guard that silently reads a different repository than the one being
    // released is worse than one that fails.
    it("reads the repository semantic-release is releasing, not the process cwd", () => {
      gitHasTags("v1.0.0");
      listTags("/some/other/checkout");
      expect(execFileSync).toHaveBeenCalledWith("git", ["tag", "--list", "v*"], {
        encoding: "utf8",
        cwd: "/some/other/checkout",
      });
    });

    it("carries context.cwd through from verifyRelease", () => {
      gitHasTags("v1.6.0-beta.364");
      guard.verifyRelease({
        nextRelease: { version: "1.6.0-beta.365" },
        cwd: "/some/other/checkout",
        logger,
      });
      expect(execFileSync).toHaveBeenCalledWith(
        "git",
        ["tag", "--list", "v*"],
        expect.objectContaining({ cwd: "/some/other/checkout" }),
      );
    });
  });
});
