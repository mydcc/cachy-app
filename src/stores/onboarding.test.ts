// @vitest-environment jsdom
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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { OnboardingStore } from "./onboarding.svelte";
import { effectsState } from "./effects.svelte";

describe("OnboardingStore", () => {
  let store: OnboardingStore;

  beforeEach(() => {
    localStorage.clear();
    effectsState.duckEvents = [];
    store = new OnboardingStore();
  });

  it("initializes in inactive state with 4 steps", () => {
    expect(store.isActive).toBe(false);
    expect(store.currentStep).toBe(0);
    expect(store.totalSteps).toBe(4);
    expect(store.isFirstStep).toBe(true);
    expect(store.isLastStep).toBe(false);
    expect(store.activeStep?.id).toBe("risk_calculator");
  });

  it("start() activates the tour at step 0 and triggers onboarding_step event", () => {
    store.start();
    expect(store.isActive).toBe(true);
    expect(store.currentStep).toBe(0);
    // Duck events queue since FEAT-0257's follow-up; assert on the latest one.
    expect(effectsState.duckEvents.at(-1)).toEqual({ type: "onboarding_step", step: 0 });
  });

  it("next() advances through steps and triggers duck events", () => {
    store.start();
    store.next();
    expect(store.currentStep).toBe(1);
    expect(store.activeStep?.id).toBe("tp_targets");
    expect(effectsState.duckEvents.at(-1)).toEqual({ type: "onboarding_step", step: 1 });

    store.next();
    expect(store.currentStep).toBe(2);
    expect(store.activeStep?.id).toBe("market_data");

    store.next();
    expect(store.currentStep).toBe(3);
    expect(store.activeStep?.id).toBe("journal_privacy");
    expect(store.isLastStep).toBe(true);
  });

  it("prev() moves backward through steps", () => {
    store.start();
    store.next();
    store.next();
    expect(store.currentStep).toBe(2);

    store.prev();
    expect(store.currentStep).toBe(1);
    expect(effectsState.duckEvents.at(-1)).toEqual({ type: "onboarding_step", step: 1 });
  });

  it("calling next() on the last step completes the tour, sets localStorage and triggers onboarding_complete", () => {
    store.start();
    store.next(); // 1
    store.next(); // 2
    store.next(); // 3 (last)
    store.next(); // completes

    expect(store.isActive).toBe(false);
    expect(localStorage.getItem("cachy_onboarding_completed")).toBe("completed");
    expect(effectsState.duckEvents.at(-1)).toEqual({ type: "onboarding_complete" });
  });

  it("skip() dismisses the tour immediately and marks the outcome as skipped", () => {
    store.start();
    store.skip();

    expect(store.isActive).toBe(false);
    expect(localStorage.getItem("cachy_onboarding_completed")).toBe("skipped");
  });

  it("triggerStartWithDelay() closes settings and triggers start after timer", async () => {
    vi.useFakeTimers();
    store.triggerStartWithDelay(500);

    expect(store.isActive).toBe(false);
    vi.advanceTimersByTime(500);
    expect(store.isActive).toBe(true);
    expect(store.currentStep).toBe(0);
    vi.useRealTimers();
  });
});
