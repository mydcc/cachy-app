#!/usr/bin/env node
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
 * archify.mjs — runs the pinned Archify renderer (BUG-0834).
 *
 *   node scripts/archify.mjs validate        schema + layout checks (showcase)
 *   node scripts/archify.mjs build [out]     render the HTML (default: the committed file)
 *
 * WHY THIS EXISTS
 *
 * `npm run arch` used to call a hard-coded path inside one agent's skill root,
 * and CI cloned Archify HEAD. Three sources of truth — CI's HEAD, whatever a
 * contributor had installed, and the version stamped into the committed HTML —
 * so an unrelated architecture PR could go red because the renderer moved.
 *
 * `archify.pin.json` is now the only place that names a version. This script
 * resolves exactly that commit, wherever it lives, and refuses anything else:
 * an installed copy of another version is skipped, never trusted. It is also
 * the one entry point CI uses, so a local run and the freshness gate cannot
 * disagree about the renderer.
 *
 * RESOLUTION ORDER
 *
 *   1. $ARCHIFY_DIR            an explicit checkout's `archify/` directory
 *   2. the user cache          ~/.cache/cachy-app/archify/<commit>
 *   3. fetch the pinned commit into (2)
 *
 * Fetching is by commit hash, not by tag, so the content is verified by
 * construction (a tag can be moved; a hash cannot), and dependencies install
 * with `--ignore-scripts`. A renderer upgrade is a PR that changes the pin and
 * regenerates the HTML once.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIAGRAM_JSON = "docs/architecture/cachy-architecture.dataflow.json";
const DIAGRAM_HTML = "docs/architecture/cachy-architecture.dataflow.html";
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

/** @returns {{repo: string, version: string, commit: string}} */
export function readPin(pinPath = join(HERE, "archify.pin.json")) {
  const pin = JSON.parse(readFileSync(pinPath, "utf8"));
  for (const key of ["repo", "version", "commit"]) {
    if (typeof pin[key] !== "string" || pin[key] === "") {
      throw new Error(`archify.pin.json: "${key}" is missing`);
    }
  }
  if (!COMMIT_PATTERN.test(pin.commit)) {
    throw new Error('archify.pin.json: "commit" must be a full 40-character SHA');
  }
  return pin;
}

/** An installed copy counts only when it is exactly the pinned version. */
export function installedVersion(archifyDir) {
  try {
    const manifest = JSON.parse(readFileSync(join(archifyDir, "package.json"), "utf8"));
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
}

/**
 * The version string alone cannot identify the renderer: upstream changed the
 * emitted HTML between two commits that both say 3.2.0. The commit decides.
 */
export function isPinnedInstall(archifyDir, pin) {
  return (
    existsSync(join(archifyDir, "bin", "archify.mjs")) &&
    existsSync(join(archifyDir, "node_modules")) &&
    installedVersion(archifyDir) === pin.version &&
    capture("git", ["rev-parse", "HEAD"], archifyDir) === pin.commit
  );
}

export function cacheRoot(env = process.env) {
  const base = env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "cachy-app", "archify");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function fetchPinned(pin, checkout) {
  mkdirSync(checkout, { recursive: true });
  if (!existsSync(join(checkout, ".git"))) {
    run("git", ["init", "--quiet"], { cwd: checkout });
    run("git", ["remote", "add", "origin", pin.repo], { cwd: checkout });
  }
  run("git", ["fetch", "--quiet", "--depth", "1", "origin", pin.commit], { cwd: checkout });
  run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: checkout });
  const head = capture("git", ["rev-parse", "HEAD"], checkout);
  if (head !== pin.commit) {
    throw new Error(`fetched ${head || "nothing"}, expected pinned commit ${pin.commit}`);
  }
  // Lifecycle scripts of a third-party package never run here.
  run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: join(checkout, "archify"),
  });
}

/** @returns {string} the directory holding bin/archify.mjs for the pinned version */
export function resolveArchify(pin, env = process.env) {
  if (env.ARCHIFY_DIR) {
    const explicit = resolve(env.ARCHIFY_DIR);
    if (!isPinnedInstall(explicit, pin)) {
      const found = installedVersion(explicit) ?? "no readable package.json";
      throw new Error(
        `ARCHIFY_DIR=${explicit} is not the pinned Archify (version ${pin.version}, ` +
          `commit ${pin.commit}; found version: ${found}). ` +
          `The committed HTML is rendered by that commit; unset ARCHIFY_DIR to fetch it.`,
      );
    }
    return explicit;
  }
  const checkout = join(cacheRoot(env), pin.commit);
  const archifyDir = join(checkout, "archify");
  if (isPinnedInstall(archifyDir, pin)) return archifyDir;
  console.error(`Fetching Archify ${pin.version} (${pin.commit.slice(0, 10)}) into ${checkout}`);
  fetchPinned(pin, checkout);
  if (!isPinnedInstall(archifyDir, pin)) {
    throw new Error(`Archify at ${archifyDir} is not version ${pin.version} after fetch`);
  }
  return archifyDir;
}

export function archifyArgs(mode, out) {
  if (mode === "validate") {
    return ["validate", "dataflow", DIAGRAM_JSON, "--quality", "showcase"];
  }
  if (mode === "build") {
    return ["deliver", "dataflow", DIAGRAM_JSON, out ?? DIAGRAM_HTML];
  }
  throw new Error(`unknown mode "${mode}" — use "validate" or "build [out.html]"`);
}

function main(argv) {
  const [mode, out] = argv;
  const args = archifyArgs(mode, out);
  const archifyDir = resolveArchify(readPin());
  const result = spawnSync(process.execPath, [join(archifyDir, "bin", "archify.mjs"), ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`archify: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
