/*
 * Copyright (C) 2026 MYDCT
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

/*
 * FEAT-0743 — one-way rule source.
 *
 * `WindowBase` needs the current window rules on construction, but importing
 * the settings store from `lib/windows` closes an import cycle that is fatal:
 * settings imports the UI store, which imports window implementations that
 * `extend WindowBase` before it finished evaluating. The settings module
 * publishes a live reader here instead, so the dependency points one way:
 * settings → this module ← WindowBase.
 *
 * The default reader returns an empty list, which is exactly today's
 * behaviour for any caller that never loads the settings module (e.g. a
 * focused unit test of the window layer).
 */

import type { WindowRule } from "../../stores/settings/settingsTypes";

let readRules: () => readonly WindowRule[] = () => [];

/** Publish the live rule list. Called once by the settings module. */
export function setWindowRuleSource(read: () => readonly WindowRule[]): void {
  readRules = read;
}

/** The current rules, or an empty list when no source is registered. */
export function readWindowRules(): readonly WindowRule[] {
  return readRules();
}
