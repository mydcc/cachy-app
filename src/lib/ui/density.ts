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
 * FEAT-0614 — the two pieces of density that are logic rather than tokens.
 *
 * `densityGap` exists because `SettingsGrid` is called with a per-section
 * rhythm (`gap-2` … `gap-6`) at 47 of its 51 sites. Scaling only the default
 * would leave the visible default tab untouched, which is how a density mode
 * ends up looking like a bug. The scale multiplies the Tailwind step instead:
 * `gap-4` = 1rem stays 1rem in `default`, becomes 0.75rem in `compact`.
 *
 * `applyDensityAttribute` is the whole store → DOM wiring. It lives here so a
 * happy-dom test can exercise it; the layout effect is a one-liner on top.
 */

import type { DensityMode } from "../../stores/settings/settingsTypes";

/** Tailwind's spacing step: `gap-N` is N × 0.25rem. */
const REM_PER_STEP = 0.25;

/**
 * Rewrites every `gap`, `gap-x` and `gap-y` token in `utility` to the same step
 * multiplied by `--density-gap-scale`. Tokens that are not numeric spacing
 * utilities pass through unchanged, so an arbitrary value keeps working.
 */
export function densityGap(utility: string): string {
    return utility
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => {
            const match = token.match(/^(gap(?:-[xy])?)-(\d+(?:\.\d+)?)$/);
            if (!match) return token;

            const rem = String(Number((Number(match[2]) * REM_PER_STEP).toFixed(4)));
            return `${match[1]}-[calc(var(--density-gap-scale)*${rem}rem)]`;
        })
        .join(" ");
}

/**
 * Writes the mode onto the root element. `default` is written as well: the
 * attribute is the single switch every rule keys on, and removing it would
 * create a second "unset" state nothing styles.
 */
export function applyDensityAttribute(
    root: { dataset: DOMStringMap },
    mode: DensityMode,
): void {
    root.dataset.density = mode;
}
