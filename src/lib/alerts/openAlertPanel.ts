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
 * FEAT-0395 — the one way an entry point outside the panel opens it.
 *
 * Seed first, then open. A caller that got that order the other way round
 * would have its draft blanked by the shell's own mount, and the failure would
 * look like "the chart sometimes forgets the price" rather than like an
 * ordering bug. One function, so there is one order and it is right.
 *
 * Class A throughout (ADR-0001): a draft rule is strategy and never leaves the
 * device — this only moves it between two stores in the same tab.
 */

import {
  alertPanelState,
  type AlertPanelSeed,
} from "../../stores/alertPanel.svelte";
import { uiState } from "../../stores/ui.svelte";

/**
 * Opens the Super-Alert panel on the seeded builder with the draft filled in.
 *
 * Arms nothing: the panel still shows the plain-language sentence and still
 * requires the trader to press its own arm button (ADR-0012 decision 5).
 */
export function openAlertPanelWith(seed: AlertPanelSeed): void {
  alertPanelState.seed(seed);
  uiState.toggleAlertsModal(true);
}
