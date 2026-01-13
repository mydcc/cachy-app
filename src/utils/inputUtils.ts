import Decimal from "decimal.js";

export type NumberInputOptions = {
  decimalPlaces?: number;
  maxDecimalPlaces?: number;
  isPercentage?: boolean;
  noDecimals?: boolean;
  maxValue?: number;
  minValue?: number;
};

export function numberInput(
  node: HTMLInputElement,
  options: NumberInputOptions
) {
  let {
    decimalPlaces,
    maxDecimalPlaces,
    isPercentage = false,
    noDecimals = false,
    maxValue,
    minValue,
  } = options;
  let stickyDecimalPlaces: number | null = null;

  const getDecimalPlaces = (value: string): number => {
    if (value.includes(".")) {
      return value.split(".")[1].length;
    }
    return 0;
  };

  const updateStickyPrecision = (value: string) => {
    const cleanValue = value.replace(",", ".").trim();
    if (cleanValue === "" || isNaN(parseFloat(cleanValue))) {
      stickyDecimalPlaces = null;
    } else {
      stickyDecimalPlaces = getDecimalPlaces(cleanValue);
    }
  };

  updateStickyPrecision(node.value);

  function handleInput(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    let value = inputElement.value;
    const originalValue = value;
    const cursorPosition = inputElement.selectionStart;

    value = value.replace(/,/g, ".");

    let sanitizedValue = "";
    let hasDecimal = false;
    for (const char of value) {
      if (/\d/.test(char)) {
        sanitizedValue += char;
      } else if (char === "." && !hasDecimal) {
        sanitizedValue += char;
        hasDecimal = true;
      }
    }
    value = sanitizedValue;

    if (value !== originalValue) {
      const diff = value.length - originalValue.length;
      inputElement.value = value;
      if (cursorPosition) {
        const newCursorPosition = Math.max(0, cursorPosition + diff);
        inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }

    updateStickyPrecision(inputElement.value);
  }

  function handleBlur(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    const rawValue = inputElement.value.replace(",", ".");
    try {
      if (rawValue.trim() !== "") {
        const val = new Decimal(rawValue);
        inputElement.value = val.toString();
      }
    } catch {
      // Ignore invalid numbers
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    const allowedKeys = [
      "Backspace",
      "Delete",
      "Tab",
      "Enter",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
    ];
    const isShortcut = event.ctrlKey || event.metaKey;
    const isAllowedKey = allowedKeys.includes(event.key);
    const isDecimalSeparator = event.key === "." || event.key === ",";
    const isDigit = /^[0-9]$/.test(event.key);

    if (noDecimals && isDecimalSeparator) {
      event.preventDefault();
      return;
    }

    if (isDecimalSeparator && node.value.includes(".")) {
      event.preventDefault();
      return;
    }

    if (!isDigit && !isAllowedKey && !isShortcut && !isDecimalSeparator) {
      event.preventDefault();
      return;
    }

    if (isDigit) {
      const limit = maxDecimalPlaces ?? decimalPlaces;
      if (limit !== undefined) {
        const value = node.value;
        const selectionStart = node.selectionStart ?? 0;
        const selectionEnd = node.selectionEnd ?? 0;
        const decimalPointIndex = value.indexOf(".");

        if (decimalPointIndex !== -1 && selectionStart > decimalPointIndex) {
          if (
            getDecimalPlaces(value) >= limit &&
            selectionStart === selectionEnd
          ) {
            event.preventDefault();
            return;
          }
        }
      }
    }

    const isArrowKey = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (!isArrowKey) {
      return;
    }
    event.preventDefault();

    const operation = event.key === "ArrowUp" ? "add" : "sub";
    const rawValue = node.value.replace(",", ".");
    const cursorPosition = node.selectionStart ?? rawValue.length;

    if (rawValue.trim() === "" || isNaN(parseFloat(rawValue))) {
      handleEmptyInputArrow(operation);
      return;
    }

    try {
      performStep(rawValue, operation, cursorPosition);
    } catch (error) {
      console.error("Error in handleKeyDown:", error);
    }
  }

  function handleEmptyInputArrow(operation: "add" | "sub") {
    let startValue = 1;
    if (minValue !== undefined && startValue < minValue) {
      startValue = minValue;
    }
    let newValue =
      operation === "add"
        ? new Decimal(startValue)
        : new Decimal(minValue !== undefined ? minValue : 0);

    newValue = clampValue(newValue);

    const finalValueString = newValue.toString();
    updateNodeValue(finalValueString, finalValueString.length);
  }

  function performStep(
    rawValue: string,
    operation: "add" | "sub",
    cursorPosition: number
  ) {
    let value = new Decimal(rawValue);

    const step = calculateStep(rawValue, cursorPosition);
    let newValue = value[operation](step);
    newValue = clampValue(newValue);

    const originalLength = node.value.length;
    const finalValueString = formatNewValue(newValue, operation);

    const lengthDifference = finalValueString.length - originalLength;
    const newCursorPosition = cursorPosition + lengthDifference;

    updateNodeValue(finalValueString, newCursorPosition);
  }

  function calculateStep(rawValue: string, cursorPosition: number): Decimal {
    // For strict mode, the original cursor-based logic is sufficient.
    if (decimalPlaces !== undefined) {
      const decimalPointIndex = rawValue.indexOf(".");
      let power;
      if (decimalPointIndex === -1) {
        power = rawValue.length - cursorPosition;
      } else {
        if (cursorPosition > decimalPointIndex) {
          power = decimalPointIndex + 1 - cursorPosition;
        } else {
          power = decimalPointIndex - cursorPosition;
        }
      }
      return new Decimal(10).pow(power);
    }

    // For dynamic mode, combine cursor position and sticky precision.
    // 1. Calculate step based on cursor position.
    const decimalPointIndex = rawValue.indexOf(".");
    let power;
    if (decimalPointIndex === -1) {
      power = rawValue.length - cursorPosition;
    } else {
      if (cursorPosition > decimalPointIndex) {
        power = decimalPointIndex + 1 - cursorPosition;
      } else {
        power = decimalPointIndex - cursorPosition;
      }
    }
    const cursorStep = new Decimal(10).pow(power);

    // 2. Calculate minimum step based on sticky precision.
    const minStep =
      stickyDecimalPlaces && stickyDecimalPlaces > 0
        ? new Decimal(10).pow(new Decimal(-stickyDecimalPlaces))
        : new Decimal(1);

    // 3. Return the larger of the two.
    return Decimal.max(cursorStep, minStep);
  }

  function clampValue(value: Decimal): Decimal {
    if (maxValue !== undefined && value.greaterThan(maxValue)) {
      return new Decimal(maxValue);
    }
    if (minValue !== undefined && value.lessThan(minValue)) {
      return new Decimal(minValue);
    }
    return value;
  }

  function formatNewValue(value: Decimal, operation: "add" | "sub"): string {
    if (noDecimals) {
      return value.toFixed(0);
    }

    if (decimalPlaces !== undefined) {
      return value.toFixed(decimalPlaces);
    }

    if (stickyDecimalPlaces !== null) {
      if (operation === "add") {
        return value.toFixed(stickyDecimalPlaces);
      } else {
        return value.toString();
      }
    }

    return value.toString();
  }

  function updateNodeValue(
    finalValueString: string,
    newCursorPosition: number
  ) {
    node.value = finalValueString;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.setSelectionRange(newCursorPosition, newCursorPosition);
  }

  node.addEventListener("input", handleInput);
  node.addEventListener("keydown", handleKeyDown);
  node.addEventListener("blur", handleBlur);

  return {
    update(newOptions: NumberInputOptions) {
      options = { ...options, ...newOptions };
      decimalPlaces = newOptions.decimalPlaces;
      maxDecimalPlaces = newOptions.maxDecimalPlaces;
      isPercentage = newOptions.isPercentage ?? isPercentage;
      noDecimals = newOptions.noDecimals ?? noDecimals;
      maxValue = newOptions.maxValue;
      minValue = newOptions.minValue;
      updateStickyPrecision(node.value);
    },
    destroy() {
      node.removeEventListener("input", handleInput);
      node.removeEventListener("keydown", handleKeyDown);
      node.removeEventListener("blur", handleBlur);
    },
  };
}
