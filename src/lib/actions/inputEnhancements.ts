export function enhancedInput(node: HTMLElement, options: { step?: number, min?: number, max?: number, noDecimals?: boolean, rightOffset?: string } = {}) {
    const step = options.step || 1;
    // The visual arrow buttons are removed as per user request, but we keep the logic structure
    // in case we need to re-enable them later or for wheel support.

    // Ensure parent is relative for absolute positioning if we were adding elements,
    // but now we just attach wheel listener.

    function triggerInput() {
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function updateValue(delta: number) {
        const input = node as HTMLInputElement;
        let val = parseFloat(input.value);
        if (isNaN(val)) val = 0;

        let newVal = val + delta;

        // Precision handling to avoid floating point errors (e.g. 0.1 + 0.2)
        const stepStr = String(step);
        const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
        newVal = parseFloat(newVal.toFixed(decimals));

        if (options.min !== undefined && newVal < options.min) newVal = options.min;
        if (options.max !== undefined && newVal > options.max) newVal = options.max;

        input.value = String(newVal);
        triggerInput();
    }

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (e.deltaY < 0) updateValue(step);
        else updateValue(-step);
    };

    node.addEventListener('wheel', handleWheel, { passive: false });

    return {
        destroy() {
            node.removeEventListener('wheel', handleWheel);
        }
    };
}
