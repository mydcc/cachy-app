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

import type { TranslationKey } from "../../locales/schema";

export interface OnboardingStep {
  id: string;
  /**
   * Candidate selectors in priority order. The spotlight highlights the first
   * candidate that exists AND is visible (non-zero rect) — a hidden responsive
   * variant must never win just because it appears first in the DOM.
   */
  targetSelectors: string[];
  titleKey: TranslationKey;
  descKey: TranslationKey;
  preferredPlacement?: "top" | "bottom" | "left" | "right" | "auto";
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "risk_calculator",
    targetSelectors: ["#trade-setup-card"],
    titleKey: "onboarding.step1.title",
    descKey: "onboarding.step1.desc",
    preferredPlacement: "auto",
  },
  {
    id: "tp_targets",
    targetSelectors: ["#tp-targets-card"],
    titleKey: "onboarding.step2.title",
    descKey: "onboarding.step2.desc",
    preferredPlacement: "auto",
  },
  {
    id: "market_data",
    targetSelectors: ["#market-overview-widget"],
    titleKey: "onboarding.step3.title",
    descKey: "onboarding.step3.desc",
    preferredPlacement: "bottom",
  },
  {
    id: "journal_privacy",
    // Desktop button first — the mobile toggle is md:hidden and would win on
    // document order, producing a degenerate zero-size spotlight on desktop.
    targetSelectors: ["#view-journal-btn-desktop", "#journal-toggle-btn"],
    titleKey: "onboarding.step4.title",
    descKey: "onboarding.step4.desc",
    preferredPlacement: "top",
  },
];
