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
    hasAction?: boolean;
    rightOffset?: string;
  } = {},
) {
  let currentOptions = { ...options };
  const step = () => currentOptions.step || 1;

  // Use option if provided, otherwise fallback to global setting
  const globalShow = settingsState.showSpinButtons;
  const showSpinButtons =
    currentOptions.showSpinButtons !== undefined
      ? currentOptions.showSpinButtons
      : globalShow;

  // Set inputMode for mobile keyboards
  if (currentOptions.noDecimals) {
    node.inputMode = "numeric";
  } else {
    node.inputMode = "decimal";
  }

  let wrapper: HTMLDivElement | null = null;
  let container: HTMLDivElement | null = null;
  let upBtn: HTMLDivElement | null = null;
  let downBtn: HTMLDivElement | null = null;

  function applyLayout() {
    if (!container) return;

    if (currentOptions.hasAction) {
      container.classList.add("with-action");
      node.style.paddingRight = "48px";
    } else if (currentOptions.rightOffset) {
      container.classList.remove("with-action");
      const offsetNum = parseInt(currentOptions.rightOffset, 10) || 0;
      node.style.paddingRight = `${offsetNum + 20}px`;
    } else {
      container.classList.remove("with-action");
      node.style.paddingRight = "24px";
    }

    if (currentOptions.rightOffset) {
      container.style.right = currentOptions.rightOffset;
    } else if (!currentOptions.hasAction) {
      container.style.right = "";
    }
  }

  if (showSpinButtons !== false) {
    // Create wrapper and container for custom spin buttons
    wrapper = document.createElement("div");
    wrapper.className = "input-wrapper";
    wrapper.style.position = "relative";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    
    // Copy width and flex classes from the input to the wrapper
    const sizingClasses = Array.from(node.classList).filter(c => 
      c.startsWith('w-') || c === 'flex-1'
    );
    if (sizingClasses.length > 0) {
      wrapper.classList.add(...sizingClasses);
    }

    // Position the wrapper in the DOM
    if (node.parentNode) {
      node.parentNode.insertBefore(wrapper, node);
      wrapper.appendChild(node);
    }

    container = document.createElement("div");
    container.className = "custom-spin-buttons";
    if (showSpinButtons === "hover") {
      container.classList.add("hover-only");
    }

    applyLayout();

    // Helper to create safe SVG
    const createSvgIcon = (points: string) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "5");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");

      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", points);
      svg.appendChild(polyline);
      return svg;
    };

    // Up Button
    upBtn = document.createElement("div");
    upBtn.className = "spin-btn up";
    upBtn.appendChild(createSvgIcon("18 15 12 9 6 15"));

    // Down Button
    downBtn = document.createElement("div");
    downBtn.className = "spin-btn down";
    downBtn.appendChild(createSvgIcon("6 9 12 15 18 9"));

    container.appendChild(upBtn);
    container.appendChild(downBtn);
    wrapper.appendChild(container);
  }

  function triggerInput() {
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function updateValue(delta: number) {
    let valStr = node.value;
    // Handle empty or invalid input securely
    if (!valStr || isNaN(parseFloat(valStr))) { // audit: safe — input validation guard (NaN check on UI text field, not a financial value)
      valStr = String(currentOptions.min !== undefined ? currentOptions.min : 0);
    }

    try {
      const current = new Decimal(valStr);
      const d = new Decimal(delta);
      let newVal = current.plus(d);

      if (currentOptions.min !== undefined && newVal.lt(currentOptions.min)) newVal = new Decimal(currentOptions.min);
      if (currentOptions.max !== undefined && newVal.gt(currentOptions.max)) newVal = new Decimal(currentOptions.max);

      node.value = newVal.toString();
      triggerInput();
    } catch (e) {
      console.warn("Decimal input enhancement error:", e);
    }
  }

  const handleWheel = (e: WheelEvent) => {
    // We remove preventDefault() to allow passive scrolling,
    // and rely on focus state to decide if we want to change value.
    const s = step();
    if (e.deltaY < 0) updateValue(s);
    else updateValue(-s);
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
    updateValue(step());
  };

  const onDown = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateValue(-step());
  };

  node.addEventListener("focus", onFocus);
  node.addEventListener("blur", onBlur);
  if (upBtn) upBtn.addEventListener("click", onUp);
  if (downBtn) downBtn.addEventListener("click", onDown);

  return {
    update(newOptions: typeof options) {
      currentOptions = { ...newOptions };
      if (currentOptions.noDecimals) {
        node.inputMode = "numeric";
      } else {
        node.inputMode = "decimal";
      }
      applyLayout();
    },
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
