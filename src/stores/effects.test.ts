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
    while (effectsState.projectileEvents.length > 0)
      effectsState.consumeProjectileEvent();
    while (effectsState.smashEvents.length > 0)
      effectsState.consumeSmashEvent();
    while (effectsState.duckEvents.length > 0) effectsState.consumeDuckEvent();
    vi.restoreAllMocks();
  });

  it("should export a singleton instance of EffectsState", () => {
    expect(effectsState).toBeInstanceOf(EffectsState);
  });

  it("should initialize with empty queues", () => {
    const state = new EffectsState();

    expect(state.projectileEvents).toHaveLength(0);
    expect(state.smashEvents).toHaveLength(0);
    expect(state.duckEvents).toHaveLength(0);
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
      expect(effectsState.projectileEvents[0]).toEqual(mockRect);

      effectsState.consumeProjectileEvent();
      expect(effectsState.projectileEvents).toHaveLength(0);
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
      expect(effectsState.smashEvents[0]).toEqual({ rect: mockRect, id: mockId });

      effectsState.consumeSmashEvent();
      expect(effectsState.smashEvents).toHaveLength(0);
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
    expect(effectsState.projectileEvents[0]).toEqual(mockRect);

    effectsState.consumeProjectileEvent();
    expect(effectsState.projectileEvents).toHaveLength(0);
  });

  it("should handle triggerProjectile with null element", () => {
    effectsState.triggerProjectile(null as unknown as HTMLElement);
    expect(effectsState.projectileEvents).toHaveLength(0);
  });

  it("should handle triggerSmash with null element", () => {
    effectsState.triggerSmash(null as unknown as HTMLElement, "some-id");
    expect(effectsState.smashEvents).toHaveLength(0);
  });

  it("should trigger and consume smash event correctly", () => {
    const mockRect = { x: 30, y: 40, width: 50, height: 50 } as DOMRect;
    const mockElement = {
      getBoundingClientRect: vi.fn().mockReturnValue(mockRect),
    } as unknown as HTMLElement;
    const mockId = "test-smash-id";

    effectsState.triggerSmash(mockElement, mockId);
    expect(mockElement.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(effectsState.smashEvents[0]).toEqual({ rect: mockRect, id: mockId });

    effectsState.consumeSmashEvent();
    expect(effectsState.smashEvents).toHaveLength(0);
  });

  // ─── Duck Events ──────────────────────────────────────────────────────────

  it("should trigger and consume a feed duck event correctly", () => {
    effectsState.triggerDuckEvent({ type: "feed", amount: 10 });
    expect(effectsState.duckEvents[0]).toEqual({ type: "feed", amount: 10 });

    effectsState.consumeDuckEvent();
    expect(effectsState.duckEvents).toHaveLength(0);
  });

  it("should trigger and consume a trade_win duck event correctly", () => {
    effectsState.triggerDuckEvent({ type: "trade_win", pnl: 250 });
    expect(effectsState.duckEvents[0]).toEqual({ type: "trade_win", pnl: 250 });

    effectsState.consumeDuckEvent();
    expect(effectsState.duckEvents).toHaveLength(0);
  });

  it("should trigger and consume a trade_loss duck event correctly", () => {
    effectsState.triggerDuckEvent({ type: "trade_loss", pnl: -75 });
    expect(effectsState.duckEvents[0]).toEqual({ type: "trade_loss", pnl: -75 });

    effectsState.consumeDuckEvent();
    expect(effectsState.duckEvents).toHaveLength(0);
  });

  it("should trigger and consume a pet duck event correctly", () => {
    effectsState.triggerDuckEvent({ type: "pet" });
    expect(effectsState.duckEvents[0]).toEqual({ type: "pet" });

    effectsState.consumeDuckEvent();
    expect(effectsState.duckEvents).toHaveLength(0);
  });

  it("should trigger and consume a daily_login duck event correctly", () => {
    effectsState.triggerDuckEvent({ type: "daily_login" });
    expect(effectsState.duckEvents[0]).toEqual({ type: "daily_login" });

    effectsState.consumeDuckEvent();
    expect(effectsState.duckEvents).toHaveLength(0);
  });

  it("should trigger and consume an academy_complete duck event correctly", () => {
    effectsState.triggerDuckEvent({ type: "academy_complete", lessonId: "lesson-42" });
    expect(effectsState.duckEvents[0]).toEqual({ type: "academy_complete", lessonId: "lesson-42" });

    effectsState.consumeDuckEvent();
    expect(effectsState.duckEvents).toHaveLength(0);
  });

  // ─── Queue Semantics (FEAT-0257 review follow-up) ──────────────────────────
  // While FXOverlay's chunk is still loading, further triggers must not
  // overwrite pending events.

  it("should queue consecutive projectile events instead of overwriting", () => {
    const rectA = { x: 1, y: 2, width: 10, height: 10 } as DOMRect;
    const rectB = { x: 3, y: 4, width: 20, height: 20 } as DOMRect;
    const elA = { getBoundingClientRect: vi.fn().mockReturnValue(rectA) } as unknown as HTMLElement;
    const elB = { getBoundingClientRect: vi.fn().mockReturnValue(rectB) } as unknown as HTMLElement;

    effectsState.triggerProjectile(elA);
    effectsState.triggerProjectile(elB);
    expect(effectsState.projectileEvents).toEqual([rectA, rectB]);

    effectsState.consumeProjectileEvent();
    expect(effectsState.projectileEvents).toEqual([rectB]);

    effectsState.consumeProjectileEvent();
    expect(effectsState.projectileEvents).toHaveLength(0);
  });

  it("should queue consecutive smash events instead of overwriting", () => {
    const rect = { x: 5, y: 6, width: 30, height: 30 } as DOMRect;
    const el = { getBoundingClientRect: vi.fn().mockReturnValue(rect) } as unknown as HTMLElement;

    effectsState.triggerSmash(el, "id-a");
    effectsState.triggerSmash(el, "id-b");
    expect(effectsState.smashEvents.map((e) => e.id)).toEqual(["id-a", "id-b"]);

    effectsState.consumeSmashEvent();
    expect(effectsState.smashEvents.map((e) => e.id)).toEqual(["id-b"]);
  });

  it("should queue consecutive duck events instead of overwriting", () => {
    effectsState.triggerDuckEvent({ type: "daily_login" });
    effectsState.triggerDuckEvent({ type: "trade_win", pnl: 250 });
    expect(effectsState.duckEvents).toEqual([
      { type: "daily_login" },
      { type: "trade_win", pnl: 250 },
    ]);

    effectsState.consumeDuckEvent();
    expect(effectsState.duckEvents).toEqual([{ type: "trade_win", pnl: 250 }]);
  });
});
