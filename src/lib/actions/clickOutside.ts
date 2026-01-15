export function clickOutside(
  node: HTMLElement,
  { enabled, callback }: { enabled: boolean; callback: () => void },
) {
  function handleClick(event: MouseEvent) {
    if (
      enabled &&
      node &&
      !node.contains(event.target as Node) &&
      !event.defaultPrevented
    ) {
      callback();
    }
  }

  document.addEventListener("click", handleClick, true);

  return {
    update({
      enabled: newEnabled,
      callback: newCallback,
    }: {
      enabled: boolean;
      callback: () => void;
    }) {
      enabled = newEnabled;
      callback = newCallback;
    },
    destroy() {
      document.removeEventListener("click", handleClick, true);
    },
  };
}
