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

/**
 * Refuses to release a version that is not above the highest one already
 * published on the same prerelease line.
 *
 * ## Why this exists
 *
 * On 2026-09-28 a release published `1.6.0-beta.1` on a branch whose newest tag
 * was `v1.6.0-beta.364`. The counter had been reset by a misconfigured channel
 * and nothing objected: a beta tag that repeats a number already on the remote
 * is a valid, publishable version, so every step around it succeeded. Both
 * `v1.6.0-beta.1` and the `v1.6.0-beta.2` that followed had to be deleted by
 * hand.
 *
 * ## Why verifyRelease, and why not publish or prepare
 *
 * The number that matters is `nextRelease.version`. Where it is available
 * decides whether the guard can actually prevent anything, because semantic-
 * release publishes in stages (`node_modules/semantic-release/index.js`):
 *
 *   185   nextRelease.version = getNextVersion(context)   ← the version exists
 *   198   plugins.verifyRelease(context)                 ← this hook runs here
 *   202   plugins.prepare(context)
 *   208   tag(nextRelease.gitTag, ...)                   ← the tag is created
 *   210   push(repositoryUrl)                            ← the tag is remote
 *   215   plugins.publish(context)
 *
 * `prepare` is already too late for a different reason: `@semantic-release/git`
 * commits and pushes inside its own `prepare` (`lib/prepare.js:78`, via
 * `git push --tags` in `lib/git.js:62`). And `publish` at 215 is later still —
 * a plugin throwing there stops the run, but the tag has been on the remote
 * since 210, which is exactly the damage this guard exists to prevent. The
 * first version of this file used `publish` and claimed the opposite.
 *
 * `verifyRelease` is the earliest hook that has `nextRelease.version`, and its
 * definition carries `dryRun: true` (`lib/definitions/plugins.js:32`), so
 * `normalize.js:34` also runs it under `--dry-run`. That makes a dry-run a real
 * pre-flight check rather than a rehearsal that skips the one step that can
 * fail.
 */

import { execFileSync } from "node:child_process";
import semver from "semver";

/** The git prefix semantic-release writes. */
const TAG_PREFIX = "v";

/**
 * Strips the `v` prefix and returns the entries that are valid semver. Anything
 * else in `git tag --list` output is ignored rather than fatal: a repository may
 * legitimately carry tags this project never created.
 *
 * @param {string[]} tags raw tag names, e.g. `v1.6.0-beta.364`
 * @returns {{tag: string, version: string}[]}
 */
export function parseTags(tags) {
  return tags
    .map((tag) => ({
      tag,
      version: tag.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : tag,
    }))
    .filter(({ version }) => semver.valid(version) !== null);
}

/**
 * The highest existing version on the same prerelease line as the one being
 * released, across all base versions.
 *
 * The line, not the base version, is what matters: publishing `1.6.0-beta.365`
 * while `1.7.0-beta.1` exists is equally wrong, so `1.7.0-beta.1` is the bar.
 * Stable versions are their own line — `1.6.0` and `1.6.0-beta.365` are
 * different products (cachy.app and dev.cachy.app), and neither bounds the
 * other.
 *
 * The prerelease identifier is compared as a string because `semver.prerelease`
 * returns a number when the identifier is purely numeric (`1.0.0-1` → `[1]`).
 * Compared raw, such a tag would never match `"beta"`, would drop out of the
 * line, and the guard would pass without having seen it — the one direction
 * this file must not fail in.
 *
 * @param {{tag: string, version: string}[]} tags
 * @param {string | undefined} prereleaseId e.g. `"beta"`; undefined for a stable release
 * @returns {{tag: string, version: string} | null}
 */
export function highestOnLine(tags, prereleaseId) {
  const onLine = tags.filter(({ version }) => {
    const prerelease = semver.prerelease(version);
    if (prerelease === null) return prereleaseId === undefined;
    return prereleaseId !== undefined && String(prerelease[0]) === prereleaseId;
  });

  if (onLine.length === 0) return null;

  return onLine.reduce((highest, candidate) =>
    semver.gt(candidate.version, highest.version) ? candidate : highest,
  );
}

/**
 * Every tag semantic-release could have created in the repository being
 * released.
 *
 * `cwd` is semantic-release's `context.cwd`, not a bare `process.cwd()`. The two
 * happen to be the same on the CLI path (`index.js:259` defaults it), but the
 * guard reads the tags of whichever repository it is asked about — and a guard
 * that silently reads the wrong repository is worse than one that fails.
 *
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function listTags(cwd) {
  return execFileSync("git", ["tag", "--list", `${TAG_PREFIX}*`], {
    encoding: "utf8",
    cwd,
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The semantic-release plugin. Throws to abort the release.
 *
 * Fails closed on an empty tag list. A guard that cannot see any tag cannot
 * prove a version is new, and a guard that passes when it cannot tell is the
 * failure mode this file exists to prevent — the missing `channel:` in
 * release.config.js hid behind exactly that kind of silence.
 */
export default {
  name: "release-version-guard",

  verifyRelease({ nextRelease, cwd, logger = { log() {} } }) {
    const tags = parseTags(listTags(cwd));
    const rawId = semver.prerelease(nextRelease.version)?.[0];
    const prereleaseId = rawId === undefined ? undefined : String(rawId);
    const highest = highestOnLine(tags, prereleaseId);

    if (tags.length === 0) {
      throw new Error(
        "release-version-guard: no semver tags found. A release cannot be " +
          "verified as new, so it is refused. Check that the checkout fetched " +
          "tags (fetch-tags / fetch-depth: 0) before treating this as a bug.",
      );
    }

    if (highest === null) {
      logger.log(
        `No existing tag on the ${prereleaseId ?? "stable"} line; ` +
          `${nextRelease.version} is the first.`,
      );
      return;
    }

    if (!semver.gt(nextRelease.version, highest.version)) {
      throw new Error(
        `release-version-guard: refusing to release ${nextRelease.version}, ` +
          `which is not above ${highest.tag} — the highest existing tag on the ` +
          `${prereleaseId ?? "stable"} line.\n` +
          "This is what a reset version counter looks like: the release would " +
          "republish a number that is already taken. If the reset is intended " +
          "(a rollback, or a correction of a bad tag), delete the tags above it " +
          "on the remote and say so in the commit message.",
      );
    }

    logger.log(
      `${nextRelease.version} is above ${highest.tag} (${tags.length} tags seen).`,
    );
  },
};
