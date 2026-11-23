/*
 * Copyright (C) 2026 MYDCC
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

/**
 * FEAT-0265: build outputs that only a dynamic import reaches, and that the
 * service worker therefore caches on first use instead of at install.
 *
 * The file names are content hashes — Kit enforces `chunkFileNames`, so the
 * three.js chunk is `chunks/<hash>.js` with no readable name. What survives is
 * the rolldown group name (`codeSplitting.groups` in vite.config.ts), exposed
 * as `chunk.name`. This module reads it from the client bundle and hands the
 * resulting paths to the service-worker build as a virtual module, so the
 * exclusion follows every build instead of going stale after the next one.
 */

/** Rolldown group names whose chunks stay out of the precache. */
export const LAZY_CHUNK_GROUPS: readonly string[] = ["three-vendor"];

/**
 * Worker bundles that embed their own three.js copy. Their names are stable
 * (`<entry>.worker-<hash>.js`), so a pattern is enough.
 */
export const LAZY_WORKER_FILE = /(^|\/)workers\/(galaxy|tradeFlow)\.worker-[\w-]+\.js$/;

export const VIRTUAL_LAZY_PRECACHE_ID = "virtual:cachy-lazy-precache";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_LAZY_PRECACHE_ID}`;

/** The subset of a rolldown output entry this module reads. */
export interface BundleEntry {
  type: "chunk" | "asset";
  fileName: string;
  name?: string;
  isEntry?: boolean;
  imports?: string[];
}

function staticClosure(start: BundleEntry, byFile: Map<string, BundleEntry>): Set<string> {
  const seen = new Set<string>();
  const queue = [...(start.imports ?? [])];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...(byFile.get(file)?.imports ?? []));
  }
  return seen;
}

/**
 * Returns the bundle-relative file names that must not be precached.
 *
 * Throws instead of returning a shorter list when an assumption breaks: a
 * renamed group would otherwise put 1.6 MiB back into every install without a
 * trace, and a group reachable through a static import from an entry chunk
 * would make the offline cold start depend on a file that was never cached.
 */
export function collectLazyOnlyFiles(bundle: Record<string, BundleEntry>): string[] {
  const entries = Object.values(bundle);
  const byFile = new Map(entries.map((entry) => [entry.fileName, entry]));

  const groupChunks = entries.filter(
    (entry) => entry.type === "chunk" && entry.name !== undefined && LAZY_CHUNK_GROUPS.includes(entry.name),
  );
  for (const group of LAZY_CHUNK_GROUPS) {
    if (!groupChunks.some((chunk) => chunk.name === group)) {
      throw new Error(
        `[lazy-precache] no chunk named "${group}" in the client bundle — was the codeSplitting group renamed?`,
      );
    }
  }

  const groupFiles = new Set(groupChunks.map((chunk) => chunk.fileName));
  for (const entry of entries) {
    if (entry.type !== "chunk" || !entry.isEntry) continue;
    const reached = [...staticClosure(entry, byFile)].filter((file) => groupFiles.has(file));
    if (reached.length > 0) {
      throw new Error(
        `[lazy-precache] entry ${entry.fileName} statically imports ${reached.join(", ")}; ` +
          "a lazily cached chunk on the static path breaks the offline cold start.",
      );
    }
  }

  const workerFiles = entries.map((entry) => entry.fileName).filter((file) => LAZY_WORKER_FILE.test(file));
  if (workerFiles.length === 0) {
    throw new Error("[lazy-precache] no galaxy/tradeFlow worker in the client bundle — was a worker renamed?");
  }

  return [...groupFiles, ...workerFiles].sort();
}

/** The structural slice of a Vite plugin this module implements. */
interface LazyPrecachePlugin {
  name: string;
  configResolved(config: { command: string }): void;
  generateBundle(
    this: { environment: { name: string } },
    options: unknown,
    bundle: Record<string, BundleEntry>,
  ): void;
  resolveId(id: string): string | undefined;
  load(this: { environment: { name: string } }, id: string): string | undefined;
}

/**
 * Collects the lazy-only files while the client environment is bundled and
 * serves them to the service worker as `virtual:cachy-lazy-precache`. Kit
 * builds the service worker after the client (`finalise` in its build plugin),
 * so the list is complete by the time it is loaded; if it is not, the build
 * fails rather than shipping a service worker that precaches everything.
 */
export function lazyPrecachePlugin(): LazyPrecachePlugin {
  let isBuild = false;
  let collected: string[] | null = null;

  return {
    name: "cachy-lazy-precache",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      collected = collectLazyOnlyFiles(bundle);
    },
    resolveId(id) {
      return id === VIRTUAL_LAZY_PRECACHE_ID ? RESOLVED_VIRTUAL_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return undefined;
      // Dev serves no immutable chunks (`$app/manifest` is empty there), so
      // there is nothing to exclude.
      if (!isBuild) return "export const LAZY_ONLY_FILES = [];";
      if (collected === null) {
        throw new Error(
          `[lazy-precache] ${this.environment.name} loaded the lazy list before the client bundle was generated`,
        );
      }
      return `export const LAZY_ONLY_FILES = ${JSON.stringify(collected)};`;
    },
  };
}
