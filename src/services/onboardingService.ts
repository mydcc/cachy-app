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
