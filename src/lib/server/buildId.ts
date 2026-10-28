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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The build this process started from.
 *
 * `build/client/_app/version.json` is written by adapter-node during the build
 * and changes on every build, including rebuilds of the same package version.
 * Read it once at module load so the value stays bound to the process: a deploy
 * can then compare it with the file on disk and tell a replaced process from
 * one that survived the restart and still serves the previous build.
 *
 * Returns "unknown" in dev and in tests, where the file may be absent. In a
 * deploy the served value must match the build on disk, so "unknown" fails the
 * health check. A build that predates this field is handled separately: an
 * absent field is accepted when its package version matches the tree on disk,
 * which keeps a rollback to such a build working.
 */
function readBuildId(): string {
  try {
    const file = resolve('build/client/_app/version.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' && parsed.version.length > 0
      ? parsed.version
      : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const BUILD_ID = readBuildId();
