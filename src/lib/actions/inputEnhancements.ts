
import { Decimal } from 'decimal.js';

interface EnhancedInputOptions {
    step?: number;
    dynamic?: boolean;
    min?: number;
    max?: number;
    noDecimals?: boolean;
    rightOffset?: string; // e.g. '2rem' if there are other icons
}

export function enhancedInput(node: HTMLInputElement, options: EnhancedInputOptions = {}) {
    let { step = 1, dynamic = false, min = -Infinity, max = Infinity, noDecimals = false, rightOffset = '4px' } = options;

    // Ensure parent is relative for absolute positioning of arrows
    const parent = node.parentElement;
    if (parent) {
        const computedStyle = window.getComputedStyle(parent);
        if (computedStyle.position === 'static') {
             parent.style.position = 'relative';
        }
    }

    // Create container for arrows
    const arrowContainer = document.createElement('div');
    arrowContainer.className = 'enhanced-input-arrows';
    // Style the container
    Object.assign(arrowContainer.style, {
        position: 'absolute',
        right: rightOffset,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0px',
        zIndex: '20',
        opacity: '0.6', // Slightly transparent by default
        transition: 'opacity 0.2s',
        cursor: 'pointer',
        height: '100%',
        justifyContent: 'center',
        padding: '0 2px'
    });

    // Hover effect
    if (parent) {
        parent.addEventListener('mouseenter', () => arrowContainer.style.opacity = '1');
        parent.addEventListener('mouseleave', () => arrowContainer.style.opacity = '0.6');
    }

    // Arrow Up
    const upArrow = document.createElement('div');
    upArrow.innerHTML = `<svg width="8" height="5" viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L0 5L1.4 6.4L5 2.8L8.6 6.4L10 5L5 0Z"/></svg>`;
    styleArrow(upArrow);
    upArrow.style.marginBottom = '2px';

    // Arrow Down
    const downArrow = document.createElement('div');
    downArrow.innerHTML = `<svg width="8" height="5" viewBox="0 0 10 6" fill="currentColor" style="transform: rotate(180deg);"><path d="M5 0L0 5L1.4 6.4L5 2.8L8.6 6.4L10 5L5 0Z"/></svg>`;
    styleArrow(downArrow);

    arrowContainer.appendChild(upArrow);
    arrowContainer.appendChild(downArrow);

    if (parent) {
        parent.appendChild(arrowContainer);
    }

    function styleArrow(el: HTMLElement) {
        Object.assign(el.style, {
            width: '12px',
            height: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: '8px',
            userSelect: 'none'
        });
        el.onmouseenter = () => el.style.color = 'var(--accent-color)';
        el.onmouseleave = () => el.style.color = 'var(--text-secondary)';
    }

    function getDynamicStep(val: number): number {
        if (!dynamic) return step;
        const absVal = Math.abs(val);
        if (absVal === 0) return step; // default

        // Count decimals
        const s = String(val);
        if (s.includes('.')) {
            const decimals = s.split('.')[1].length;
            return Math.pow(10, -decimals);
        } else {
            return 1;
        }
    }

    function changeValue(direction: 1 | -1) {
        const currentVal = parseFloat(node.value) || 0;
        const currentStep = getDynamicStep(currentVal);

        let newVal = new Decimal(currentVal).plus(new Decimal(currentStep).times(direction));

        if (noDecimals) {
             newVal = newVal.round();
        }

        if (newVal.toNumber() < min) newVal = new Decimal(min);
        if (newVal.toNumber() > max) newVal = new Decimal(max);

        // Update input
        const prototype = Object.getPrototypeOf(node);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (prototypeValueSetter) {
            prototypeValueSetter.call(node, String(newVal));
        } else {
            node.value = String(newVal);
        }

        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const handleUp = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        changeValue(1);
    };

    const handleDown = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        changeValue(-1);
    };

    upArrow.addEventListener('mousedown', handleUp);
    downArrow.addEventListener('mousedown', handleDown);

    // Wheel Handler
    const handleWheel = (e: WheelEvent) => {
        if (document.activeElement === node) {
            e.preventDefault();
            const direction = e.deltaY < 0 ? 1 : -1;
            changeValue(direction);
        }
    };

    node.addEventListener('wheel', handleWheel, { passive: false });

    return {
        update(newOptions: EnhancedInputOptions) {
            step = newOptions.step ?? step;
            dynamic = newOptions.dynamic ?? dynamic;
            min = newOptions.min ?? min;
            max = newOptions.max ?? max;
            noDecimals = newOptions.noDecimals ?? noDecimals;
        },
        destroy() {
            node.removeEventListener('wheel', handleWheel);
            if (parent && parent.contains(arrowContainer)) {
                parent.removeChild(arrowContainer);
            }
        }
    };
}
