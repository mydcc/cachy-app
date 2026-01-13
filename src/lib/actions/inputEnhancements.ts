import { get } from "svelte/store";
import { settingsStore, type Settings } from "../../stores/settingsStore";

export function enhancedInput(
  node: HTMLInputElement,
  options: {
    step?: number;
    min?: number;
    max?: number;
    noDecimals?: boolean;
    showSpinButtons?: boolean | "hover";
    rightOffset?: string;
  } = {}
) {
  const step = options.step || 1;

  // Use option if provided, otherwise fallback to global setting
  const globalShow = (get(settingsStore) as Settings).showSpinButtons;
  const showSpinButtons =
    options.showSpinButtons !== undefined
      ? options.showSpinButtons
      : globalShow;

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
    let val = parseFloat(node.value);
    if (isNaN(val)) val = options.min || 0;

    let newVal = val + delta;

    // Precision handling
    const stepStr = String(step);
    const decimals = stepStr.includes(".") ? stepStr.split(".")[1].length : 0;
    newVal = parseFloat(newVal.toFixed(decimals));

    if (options.min !== undefined && newVal < options.min) newVal = options.min;
    if (options.max !== undefined && newVal > options.max) newVal = options.max;

    node.value = String(newVal);
    triggerInput();
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) updateValue(step);
    else updateValue(-step);
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

  node.addEventListener("wheel", handleWheel, { passive: false });
  if (upBtn) upBtn.addEventListener("click", onUp);
  if (downBtn) downBtn.addEventListener("click", onDown);

  return {
    destroy() {
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
