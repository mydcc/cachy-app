export function enhancedInput(node: HTMLElement, options: { step?: number, min?: number, max?: number, noDecimals?: boolean, rightOffset?: string } = {}) {
    const step = options.step || 1;
    const rightOffset = options.rightOffset || '2px';

    // Ensure parent is relative for absolute positioning
    const parent = node.parentElement;
    if (parent) {
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
    }

    // Create container for arrows
    const arrowContainer = document.createElement('div');
    arrowContainer.className = 'absolute top-1/2 -translate-y-1/2 flex flex-col z-20';
    arrowContainer.style.right = rightOffset;
    arrowContainer.style.height = '100%';
    arrowContainer.style.justifyContent = 'center';

    // Up Arrow
    const upBtn = document.createElement('button');
    upBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3 text-[var(--text-secondary)] hover:text-[var(--accent-color)]"><path fill-rule="evenodd" d="M11.47 7.72a.75.75 0 011.06 0l7.5 7.5a.75.75 0 11-1.06 1.06L12 9.31l-6.97 6.97a.75.75 0 01-1.06-1.06l7.5-7.5z" clip-rule="evenodd" /></svg>`;
    upBtn.className = 'p-0.5 focus:outline-none transition-colors';
    upBtn.tabIndex = -1; // Prevent tab focus
    upBtn.type = 'button';

    // Down Arrow
    const downBtn = document.createElement('button');
    downBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3 h-3 text-[var(--text-secondary)] hover:text-[var(--accent-color)]"><path fill-rule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clip-rule="evenodd" /></svg>`;
    downBtn.className = 'p-0.5 focus:outline-none transition-colors';
    downBtn.tabIndex = -1;
    downBtn.type = 'button';

    arrowContainer.appendChild(upBtn);
    arrowContainer.appendChild(downBtn);

    if (parent) parent.appendChild(arrowContainer);

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

    const handleUp = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        updateValue(step);
    };

    const handleDown = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        updateValue(-step);
    };

    const handleWheel = (e: WheelEvent) => {
        if (document.activeElement === node) {
            e.preventDefault();
            if (e.deltaY < 0) updateValue(step);
            else updateValue(-step);
        }
    };

    upBtn.addEventListener('mousedown', handleUp); // mousedown avoids focus loss issues sometimes
    downBtn.addEventListener('mousedown', handleDown);
    node.addEventListener('wheel', handleWheel, { passive: false });

    return {
        destroy() {
            upBtn.removeEventListener('mousedown', handleUp);
            downBtn.removeEventListener('mousedown', handleDown);
            node.removeEventListener('wheel', handleWheel);
            if (parent && arrowContainer.parentElement === parent) {
                parent.removeChild(arrowContainer);
            }
        }
    };
}
