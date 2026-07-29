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
 * The single place the app reads its own version from.
 *
 * `VITE_APP_VERSION` is injected at build time by `vite.config.ts`, which reads
 * the `version` field of package.json. Never hardcode a version string
 * elsewhere — it will drift out of sync with the released artifact.
 *
 * The fallback only applies when the define is missing (e.g. a bare `vitest`
 * run without the Vite config), and is deliberately marked as non-release so a
 * misconfigured build is obvious instead of silently reporting a plausible
 * version.
 */
export const APP_VERSION: string =
  import.meta.env.VITE_APP_VERSION || "0.0.0-unknown";
