// @vitest-environment happy-dom
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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackClick } from "./actions";
import * as trackingService from "../services/trackingService";

describe("actions.ts - trackClick", () => {
  let node: HTMLElement;
  let trackCustomEventSpy: ReturnType<typeof vi.spyOn>;

  const initialParams = {
    category: "TestCategory",
    action: "TestAction",
    name: "TestName",
  };

  beforeEach(() => {
    node = document.createElement("button");
    document.body.appendChild(node);
    trackCustomEventSpy = vi.spyOn(trackingService, "trackCustomEvent").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (node.parentNode) {
      document.body.removeChild(node);
    }
  });

  it("should attach click listener and track click with initial params", () => {
    const actionReturn = trackClick(node, initialParams);
    expect(trackCustomEventSpy).not.toHaveBeenCalled();

    node.click();

    expect(trackCustomEventSpy).toHaveBeenCalledTimes(1);
    expect(trackCustomEventSpy).toHaveBeenCalledWith(
      initialParams.category,
      initialParams.action,
      initialParams.name
    );

    actionReturn.destroy();
  });

  it("should set __tracking_handled on the event object", () => {
    const actionReturn = trackClick(node, initialParams);

    let eventObject: Event | null = null;
    node.addEventListener("click", (e) => {
      eventObject = e;
    });

    node.click();

    expect(eventObject).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((eventObject as any).__tracking_handled).toBe(true);

    actionReturn.destroy();
  });

  it("should track click with updated params after update is called", () => {
    const actionReturn = trackClick(node, initialParams);

    const updatedParams = {
      category: "UpdatedCategory",
      action: "UpdatedAction",
      name: "UpdatedName",
    };

    actionReturn.update(updatedParams);
    node.click();

    expect(trackCustomEventSpy).toHaveBeenCalledTimes(1);
    expect(trackCustomEventSpy).toHaveBeenCalledWith(
      updatedParams.category,
      updatedParams.action,
      updatedParams.name
    );

    actionReturn.destroy();
  });

  it("should remove event listener when destroy is called", () => {
    const actionReturn = trackClick(node, initialParams);

    actionReturn.destroy();
    node.click();

    expect(trackCustomEventSpy).not.toHaveBeenCalled();
  });
});
