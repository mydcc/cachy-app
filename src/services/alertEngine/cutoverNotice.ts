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

/**
 * FEAT-0387 — telling the trader that their alarms trigger differently now.
 *
 * Migrated alerts are pinned to `1m` Close (ADR-0012 decision 3, FEAT-0388),
 * so an alarm that used to fire the instant a price touched a level now fires
 * at the end of the minute — and one that touches and recovers inside the same
 * minute does not fire at all. Neither is a bug, both are visible from the
 * outside, and a trader who finds out by missing a fill has been failed by us
 * rather than by the market.
 *
 * Two rules govern when this is shown:
 *
 * - **Only to those it affects.** The notice appears only while the trader
 *   actually has an alert the rule engine has taken over. Warning someone
 *   about a change to alarms they do not have is noise, and noise is how a
 *   real warning gets clicked away unread.
 * - **Once.** Acknowledgement is remembered, so this is an announcement, not
 *   a recurring nag.
 *
 * Class A: the acknowledgement lives in `localStorage` and is never reported.
 */

import { browser } from "$app/environment";
import { logger } from "../logger";
import { readCoveredAlertIds } from "./ruleCoverage";

export const CUTOVER_NOTICE_STORAGE_KEY = "cachy_cutover_notice_v1";

/**
 * Whether the behaviour-change notice should be shown right now.
 *
 * Errs towards *not* showing it: a storage read that fails is not a reason to
 * put an unclosable banner in front of someone's alert list, and the notice
 * has no safety function — the alarms work either way.
 */
export async function shouldShowCutoverNotice(): Promise<boolean> {
  if (!browser) return false;

  try {
    if (localStorage.getItem(CUTOVER_NOTICE_STORAGE_KEY) !== null) return false;

    // Dynamic, not static: this file stays free of a market-store import for
    // the same reason `ruleCoverage.ts` does, and without the real predicate
    // `readCoveredAlertIds()` safely reports nothing — the notice would never
    // show at all rather than showing for an alert that cannot actually fire.
    const { isSeriesObserved } = await import("./ruleLoopWiring");
    return readCoveredAlertIds(isSeriesObserved).size > 0;
  } catch (e) {
    logger.warn("alerts", "[Cutover] Could not decide on the behaviour notice", e);
    return false;
  }
}

/** Records that the trader has seen the notice. Never throws. */
export function acknowledgeCutoverNotice(): void {
  if (!browser) return;

  try {
    localStorage.setItem(CUTOVER_NOTICE_STORAGE_KEY, new Date().toISOString());
  } catch (e) {
    // Worst case the notice appears once more. Not worth surfacing.
    logger.warn("alerts", "[Cutover] Could not record the notice acknowledgement", e);
  }
}
