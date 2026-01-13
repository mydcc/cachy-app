export function enhancedInput(node: HTMLInputElement, options: { step?: number, min?: number, max?: number, noDecimals?: boolean } = {}) {
    const step = options.step || 1;

    // Create wrapper and container for custom spin buttons
    const wrapper = document.createElement('div');
    wrapper.className = 'input-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';

    // Position the wrapper in the DOM
    if (node.parentNode) {
        node.parentNode.insertBefore(wrapper, node);
        wrapper.appendChild(node);
    }

    const container = document.createElement('div');
    container.className = 'custom-spin-buttons';

    // Up Button
    const upBtn = document.createElement('div');
    upBtn.className = 'spin-btn up';
    upBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;

    // Down Button
    const downBtn = document.createElement('div');
    downBtn.className = 'spin-btn down';
    downBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

    container.appendChild(upBtn);
    container.appendChild(downBtn);
    wrapper.appendChild(container);

    // Add padding to input to avoid text overlap
    node.style.paddingRight = '20px';

    function triggerInput() {
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function updateValue(delta: number) {
        let val = parseFloat(node.value);
        if (isNaN(val)) val = options.min || 0;

        let newVal = val + delta;

        // Precision handling
        const stepStr = String(step);
        const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
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

    node.addEventListener('wheel', handleWheel, { passive: false });
    upBtn.addEventListener('click', onUp);
    downBtn.addEventListener('click', onDown);

    return {
        destroy() {
            node.removeEventListener('wheel', handleWheel);
            upBtn.removeEventListener('click', onUp);
            downBtn.removeEventListener('click', onDown);
            if (wrapper.parentNode) {
                wrapper.parentNode.insertBefore(node, wrapper);
                wrapper.parentNode.removeChild(wrapper);
            }
        }
    };
}
