// @vitest-environment jsdom
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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { effectsState, EffectsState } from "./effects.svelte";

describe("EffectsState", () => {
  beforeEach(() => {
    effectsState.consumeProjectileEvent();
    effectsState.consumeSmashEvent();
    effectsState.consumeFeedEvent();
    vi.restoreAllMocks();
  });

  it("should export a singleton instance of EffectsState", () => {
    expect(effectsState).toBeInstanceOf(EffectsState);
  });

  it("should initialize with null states", () => {
    const state = new EffectsState();

    expect(state.projectileOrigin).toBeNull();
    expect(state.smashTarget).toBeNull();
    expect(state.feedEvent).toBeNull();
  });

  it("should trigger projectile event with a real DOM element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    // JSDOM doesn't actually render or position elements, so getBoundingClientRect
    // returns all zeros by default. We can spy on it to mock a return or just accept the zeros,
    // but setting up a spy is safer to guarantee we're testing our state mapping.
    const mockRect = { x: 10, y: 20, width: 100, height: 100 } as DOMRect;
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(mockRect);

    try {
      effectsState.triggerProjectile(el);
      expect(el.getBoundingClientRect).toHaveBeenCalledTimes(1);
      expect(effectsState.projectileOrigin).toEqual(mockRect);

      effectsState.consumeProjectileEvent();
      expect(effectsState.projectileOrigin).toBeNull();
    } finally {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  });

  it("should trigger smash event with a real DOM element", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const mockRect = { x: 30, y: 40, width: 50, height: 50 } as DOMRect;
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(mockRect);
    const mockId = "test-smash-id";

    try {
      effectsState.triggerSmash(el, mockId);
      expect(el.getBoundingClientRect).toHaveBeenCalledTimes(1);
      expect(effectsState.smashTarget).toEqual({ rect: mockRect, id: mockId });

      effectsState.consumeSmashEvent();
      expect(effectsState.smashTarget).toBeNull();
    } finally {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  });

  it("should trigger and consume projectile event correctly", () => {
    const mockRect = { x: 10, y: 20, width: 100, height: 100 } as DOMRect;
    const mockElement = {
      getBoundingClientRect: vi.fn().mockReturnValue(mockRect),
    } as unknown as HTMLElement;

    effectsState.triggerProjectile(mockElement);
    expect(mockElement.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(effectsState.projectileOrigin).toEqual(mockRect);

    effectsState.consumeProjectileEvent();
    expect(effectsState.projectileOrigin).toBeNull();
  });

  it("should handle triggerProjectile with null element", () => {
    effectsState.triggerProjectile(null as unknown as HTMLElement);
    expect(effectsState.projectileOrigin).toBeNull();
  });

  it("should handle triggerSmash with null element", () => {
    effectsState.triggerSmash(null as unknown as HTMLElement, "some-id");
    expect(effectsState.smashTarget).toBeNull();
  });

  it("should trigger and consume smash event correctly", () => {
    const mockRect = { x: 30, y: 40, width: 50, height: 50 } as DOMRect;
    const mockElement = {
      getBoundingClientRect: vi.fn().mockReturnValue(mockRect),
    } as unknown as HTMLElement;
    const mockId = "test-smash-id";

    effectsState.triggerSmash(mockElement, mockId);
    expect(mockElement.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(effectsState.smashTarget).toEqual({ rect: mockRect, id: mockId });

    effectsState.consumeSmashEvent();
    expect(effectsState.smashTarget).toBeNull();
  });

  it("should trigger and consume feed event correctly", () => {
    const amount = 500;

    effectsState.triggerFeed(amount);
    expect(effectsState.feedEvent).toEqual({ amount });

    effectsState.consumeFeedEvent();
    expect(effectsState.feedEvent).toBeNull();
  });
});
