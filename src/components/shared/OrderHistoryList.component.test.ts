// @vitest-environment happy-dom
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

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
import OrderHistoryList from "./OrderHistoryList.svelte";
import type { NormalizedOrder } from "../../types/exchange";

vi.mock("../../services/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const dictionary = en as Record<string, unknown>;
function getNestedTranslation(path: string): string {
  const parts = path.split(".");
  let current: unknown = dictionary;
  for (const part of parts) {
    if (!current || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

vi.mock("../../locales/i18n", () => {
  const translate = (key: string) => getNestedTranslation(key);
  return {
    _: {
      subscribe: (fn: (val: typeof translate) => void) => {
        fn(translate);
        return () => {};
      },
    },
    locale: {
      subscribe: (fn: (val: string) => void) => {
        fn("en");
        return () => {};
      },
    },
  };
});

describe("FEAT-0201: OrderHistoryList Component Tests", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      component = null;
    }
    if (target && target.parentNode) {
      target.parentNode.removeChild(target);
    }
    vi.clearAllMocks();
  });

  const mockOrders: NormalizedOrder[] = [
    {
      id: "ord-1",
      orderId: "ord-1",
      symbol: "BTCUSDT",
      type: "LIMIT",
      side: "BUY",
      price: "50000",
      amount: "1",
      filled: "1",
      avgPrice: "50000",
      realizedPNL: "100",
      fee: "0.01",
      status: "FILLED",
      time: 1700500000000,
    },
  ];

  it("renders time range presets toolbar and triggers onrangechange on preset click", async () => {
    const onrangechange = vi.fn();
    const onrefresh = vi.fn();

    component = mount(OrderHistoryList, {
      target,
      props: {
        orders: mockOrders,
        onrangechange,
        onrefresh,
      },
    });
    flushSync();

    // Verify preset buttons exist
    const buttons = target.querySelectorAll("button");
    const todayBtn = Array.from(buttons).find((b) => b.textContent?.trim().includes("Today"));
    expect(todayBtn).toBeTruthy();

    // Click Today preset
    todayBtn?.click();
    flushSync();

    expect(onrangechange).toHaveBeenCalledTimes(1);
    const rangeArg = onrangechange.mock.calls[0][0];
    expect(rangeArg.preset).toBe("today");
    expect(typeof rangeArg.startTime).toBe("number");
    expect(typeof rangeArg.endTime).toBe("number");
  });

  it("shows custom date inputs and applies custom UTC range", async () => {
    const onrangechange = vi.fn();

    component = mount(OrderHistoryList, {
      target,
      props: {
        orders: mockOrders,
        onrangechange,
      },
    });
    flushSync();

    // Click Custom preset
    const buttons = target.querySelectorAll("button");
    const customBtn = Array.from(buttons).find((b) => b.textContent?.trim().includes("Custom"));
    expect(customBtn).toBeTruthy();
    customBtn?.click();
    flushSync();

    // Custom inputs should now appear
    const inputs = target.querySelectorAll("input[type='date']");
    expect(inputs.length).toBe(2);

    const startInput = inputs[0] as HTMLInputElement;
    const endInput = inputs[1] as HTMLInputElement;
    startInput.value = "2026-08-01";
    startInput.dispatchEvent(new Event("input"));
    endInput.value = "2026-08-10";
    endInput.dispatchEvent(new Event("input"));
    flushSync();

    // Click Apply
    const applyBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.trim().includes("Apply"),
    );
    expect(applyBtn).toBeTruthy();
    applyBtn?.click();
    flushSync();

    expect(onrangechange).toHaveBeenCalledWith({
      startTime: Date.UTC(2026, 7, 1, 0, 0, 0, 0),
      endTime: Date.UTC(2026, 7, 10, 23, 59, 59, 999),
      preset: "custom",
    });
  });

  it("renders load more button when hasMore is true and triggers onloadmore", async () => {
    const onloadmore = vi.fn();

    component = mount(OrderHistoryList, {
      target,
      props: {
        orders: mockOrders,
        hasMore: true,
        onloadmore,
      },
    });
    flushSync();

    const loadMoreBtn = Array.from(target.querySelectorAll("button")).find((b) =>
      b.textContent?.trim().includes("Load older orders"),
    );
    expect(loadMoreBtn).toBeTruthy();

    loadMoreBtn?.click();
    flushSync();

    expect(onloadmore).toHaveBeenCalledTimes(1);
  });
});
