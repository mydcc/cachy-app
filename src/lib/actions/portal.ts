export function portal(node: HTMLElement, target: HTMLElement | string = 'body') {
    let targetEl: HTMLElement | null;

    function update(newTarget: HTMLElement | string) {
        targetEl = typeof newTarget === 'string'
            ? document.querySelector(newTarget)
            : newTarget;

        if (targetEl) {
            targetEl.appendChild(node);
        }
    }

    update(target);

    return {
        update,
        destroy() {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        }
    };
}
