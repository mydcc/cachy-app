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

import { ONBOARDING_STEPS, type OnboardingStep } from "../lib/onboarding/steps";
import { effectsState } from "./effects.svelte";
import { windowManager } from "../lib/windows/WindowManager.svelte";

const STORAGE_KEY = "cachy_onboarding_completed";

/**
 * How the tour ended. Skipped and completed are stored distinctly so a future
 * auto-pop or analytics layer can tell them apart (BUG-review 2026-08-24).
 */
export type OnboardingOutcome = "completed" | "skipped";

export class OnboardingStore {
  isActive = $state(false);
  currentStep = $state(0);
  steps: OnboardingStep[] = ONBOARDING_STEPS;
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  activeStep = $derived(this.steps[this.currentStep] ?? null);
  isFirstStep = $derived(this.currentStep === 0);
  isLastStep = $derived(this.currentStep === this.steps.length - 1);
  totalSteps = $derived(this.steps.length);

  /**
   * Starts the onboarding tour directly from step 0.
   */
  start() {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }

    // Close potentially interfering modals/windows so targets are unobstructed
    if (windowManager.isOpen("settings")) windowManager.close("settings");
    if (windowManager.isOpen("guide")) windowManager.close("guide");
    if (windowManager.isOpen("journal")) windowManager.close("journal");
    if (windowManager.isOpen("changelog")) windowManager.close("changelog");

    this.currentStep = 0;
    this.isActive = true;
    effectsState.triggerDuckEvent({ type: "onboarding_step", step: 0 });
  }

  /**
   * Closes the settings window and schedules the tour after a specified delay (default 2000ms).
   */
  triggerStartWithDelay(delayMs = 2000) {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }

    // Immediately close settings modal
    if (windowManager.isOpen("settings")) {
      windowManager.close("settings");
    }

    this.startTimer = setTimeout(() => {
      this.start();
    }, delayMs);
  }

  /**
   * Advances to the next step or finishes the tour on the last step.
   */
  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      effectsState.triggerDuckEvent({
        type: "onboarding_step",
        step: this.currentStep,
      });
    } else {
      this.complete();
    }
  }

  /**
   * Navigates back to the previous step.
   */
  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      effectsState.triggerDuckEvent({
        type: "onboarding_step",
        step: this.currentStep,
      });
    }
  }

  /**
   * Dismisses the tour early.
   */
  skip() {
    this.finish("skipped");
  }

  /**
   * Completes the tour, persists completion, and fires duck celebration & achievement event.
   */
  complete() {
    this.finish("completed");
    effectsState.triggerDuckEvent({ type: "onboarding_complete" });
  }

  private finish(outcome: OnboardingOutcome) {
    if (this.startTimer) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    this.isActive = false;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, outcome);
    }
  }
}

export const onboardingState = new OnboardingStore();
