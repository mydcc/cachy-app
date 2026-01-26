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

import { get } from "svelte/store";
import { settingsState } from "../../stores/settings.svelte";
import { Decimal } from "decimal.js";

export function enhancedInput(
  node: HTMLInputElement,
  options: {
    step?: number;
    min?: number;
    max?: number;
    noDecimals?: boolean;
    showSpinButtons?: boolean | "hover";
    rightOffset?: string;
  } = {},
) {
  const step = options.step || 1;

  // Use option if provided, otherwise fallback to global setting
  const globalShow = settingsState.showSpinButtons;
  const showSpinButtons =
    options.showSpinButtons !== undefined
      ? options.showSpinButtons
      : globalShow;

  // Set inputMode for mobile keyboards
  if (options.noDecimals) {
    node.inputMode = "numeric";
  } else {
    node.inputMode = "decimal";
  }

  let wrapper: HTMLDivElement | null = null;
  let upBtn: HTMLDivElement | null = null;
  let downBtn: HTMLDivElement | null = null;

  if (showSpinButtons !== false) {
    // Create wrapper and container for custom spin buttons
    wrapper = document.createElement("div");
    wrapper.className = "input-wrapper";
    wrapper.style.position = "relative";
    wrapper.style.display = "inline-flex";

    // Position the wrapper in the DOM
    if (node.parentNode) {
      node.parentNode.insertBefore(wrapper, node);
      wrapper.appendChild(node);
    }

    const container = document.createElement("div");
    container.className = "custom-spin-buttons";
    if (showSpinButtons === "hover") {
      container.classList.add("hover-only");
    }

    if (options.rightOffset) {
      container.style.right = options.rightOffset;
    }

    // Up Button
    upBtn = document.createElement("div");
    upBtn.className = "spin-btn up";
    upBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;

    // Down Button
    downBtn = document.createElement("div");
    downBtn.className = "spin-btn down";
    downBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    container.appendChild(upBtn);
    container.appendChild(downBtn);
    wrapper.appendChild(container);

    // Add padding to input to avoid text overlap
    node.style.paddingRight = "20px";
  }

  function triggerInput() {
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function updateValue(delta: number) {
    let valStr = node.value;
    // Handle empty or invalid input securely
    if (!valStr || isNaN(parseFloat(valStr))) {
      valStr = String(options.min !== undefined ? options.min : 0);
    }

    try {
      const current = new Decimal(valStr);
      const d = new Decimal(delta);
      let newVal = current.plus(d);

      if (options.min !== undefined && newVal.lt(options.min)) newVal = new Decimal(options.min);
      if (options.max !== undefined && newVal.gt(options.max)) newVal = new Decimal(options.max);

      node.value = newVal.toString();
      triggerInput();
    } catch (e) {
      console.warn("Decimal input enhancement error:", e);
    }
  }

  const handleWheel = (e: WheelEvent) => {
    // We remove preventDefault() to allow passive scrolling,
    // and rely on focus state to decide if we want to change value.
    if (e.deltaY < 0) updateValue(step);
    else updateValue(-step);
  };

  const onFocus = () => {
    node.addEventListener("wheel", handleWheel, { passive: true });
  };

  const onBlur = () => {
    node.removeEventListener("wheel", handleWheel);
  };

  const onUp = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateValue(step);
  };

  const onDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateValue(-step);
  };

  node.addEventListener("focus", onFocus);
  node.addEventListener("blur", onBlur);
  if (upBtn) upBtn.addEventListener("click", onUp);
  if (downBtn) downBtn.addEventListener("click", onDown);

  return {
    destroy() {
      node.removeEventListener("focus", onFocus);
      node.removeEventListener("blur", onBlur);
      node.removeEventListener("wheel", handleWheel);
      if (upBtn) upBtn.removeEventListener("click", onUp);
      if (downBtn) downBtn.removeEventListener("click", onDown);
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.insertBefore(node, wrapper);
        wrapper.parentNode.removeChild(wrapper);
      }
    },
  };
}
