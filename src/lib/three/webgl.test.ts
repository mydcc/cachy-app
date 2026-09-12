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

import { describe, it, expect, vi } from "vitest";
import { attachContextRecovery } from "./webgl";

describe("attachContextRecovery", () => {
  it("notifies on context loss and prevents the default", () => {
    const canvas = new EventTarget();
    const onLost = vi.fn();
    attachContextRecovery(canvas, { onLost });

    const event = new Event("webglcontextlost", { cancelable: true });
    const preventDefault = vi.spyOn(event, "preventDefault");
    canvas.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(onLost).toHaveBeenCalledOnce();
  });

  it("notifies on context restore", () => {
    const canvas = new EventTarget();
    const onRestored = vi.fn();
    attachContextRecovery(canvas, { onRestored });
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onRestored).toHaveBeenCalledOnce();
  });

  it("detaches both listeners", () => {
    const canvas = new EventTarget();
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const detach = attachContextRecovery(canvas, { onLost, onRestored });
    detach();

    canvas.dispatchEvent(new Event("webglcontextlost"));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onLost).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });
});
