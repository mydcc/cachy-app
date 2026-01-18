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

// src/services/onboardingService.ts
import { trackCustomEvent } from "./trackingService";
import { browser } from "$app/environment";

const FIRST_INPUT_KEY = "cachy-onboarding-first-input";
const FIRST_CALC_KEY = "cachy-onboarding-first-calc";
const FIRST_SAVE_KEY = "cachy-onboarding-first-save";

function checkAndTrack(
  key: string,
  category: string,
  action: string,
  name: string,
) {
  if (!browser) return;

  try {
    if (!localStorage.getItem(key)) {
      trackCustomEvent(category, action, name);
      localStorage.setItem(key, "true");
    }
  } catch (e) {
    console.warn(`Could not access localStorage for onboarding tracking: ${e}`);
  }
}

export const onboardingService = {
  trackFirstInput: () => {
    checkAndTrack(
      FIRST_INPUT_KEY,
      "Onboarding",
      "FirstInteraction",
      "FirstInput",
    );
  },
  trackFirstCalculation: () => {
    checkAndTrack(
      FIRST_CALC_KEY,
      "Onboarding",
      "FirstInteraction",
      "FirstCalculation",
    );
  },
  trackFirstJournalSave: () => {
    checkAndTrack(
      FIRST_SAVE_KEY,
      "Onboarding",
      "FirstInteraction",
      "FirstJournalSave",
    );
  },
};
