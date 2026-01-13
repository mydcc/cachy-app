import {
  computePosition,
  flip,
  shift,
  offset,
  arrow,
  type Placement,
  autoUpdate,
} from "@floating-ui/dom";

export interface TooltipOptions {
  content: string;
  placement?: Placement;
  allowHtml?: boolean;
  theme?: "dark" | "light" | "custom";
  delay?: number;
}

export function tooltip(node: HTMLElement, options: TooltipOptions | string) {
  let tooltipElement: HTMLElement | null = null;
  let arrowElement: HTMLElement | null = null;
  let cleanup: (() => void) | null = null;
  let timer: any = null;

  let config: TooltipOptions =
    typeof options === "string"
      ? { content: options, placement: "top", allowHtml: false, delay: 0 }
      : { placement: "top", allowHtml: false, delay: 0, ...options };

  function updateConfig(newOptions: TooltipOptions | string) {
    config =
      typeof newOptions === "string"
        ? { content: newOptions, placement: "top", allowHtml: false, delay: 0 }
        : { placement: "top", allowHtml: false, delay: 0, ...newOptions };

    if (tooltipElement) {
      setContent();
    }
  }

  function setContent() {
    if (!tooltipElement) return;
    const contentContainer = tooltipElement.querySelector(
      ".tooltip-content-inner"
    );
    if (contentContainer) {
      if (config.allowHtml) {
        contentContainer.innerHTML = config.content;
      } else {
        contentContainer.textContent = config.content;
      }
    }
  }

  function createTooltip() {
    if (tooltipElement) return;

    tooltipElement = document.createElement("div");
    tooltipElement.className = "floating-tooltip";
    Object.assign(tooltipElement.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "max-content",
      maxWidth: "300px",
      zIndex: "9999",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 0.2s ease-in-out",
    });

    // Styling based on theme (can be moved to global CSS if preferred)
    tooltipElement.style.backgroundColor = "var(--bg-tertiary, #1e293b)";
    tooltipElement.style.color = "var(--text-primary, #f1f5f9)";
    tooltipElement.style.padding = "8px 12px";
    tooltipElement.style.borderRadius = "6px";
    tooltipElement.style.fontSize = "0.75rem"; // 12px
    tooltipElement.style.boxShadow =
      "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
    tooltipElement.style.border = "1px solid var(--border-color, #334155)";
    tooltipElement.style.lineHeight = "1.4";

    arrowElement = document.createElement("div");
    arrowElement.className = "floating-arrow";
    Object.assign(arrowElement.style, {
      position: "absolute",
      width: "8px",
      height: "8px",
      backgroundColor: "inherit",
      transform: "rotate(45deg)",
      borderRight: "1px solid var(--border-color, #334155)",
      borderBottom: "1px solid var(--border-color, #334155)",
      zIndex: "-1", // Behind the tooltip background
    });

    tooltipElement.appendChild(arrowElement);

    const contentDiv = document.createElement("div");
    contentDiv.className = "tooltip-content-inner";
    tooltipElement.appendChild(contentDiv);

    document.body.appendChild(tooltipElement);
    setContent();

    // Position it immediately but invisible to get dimensions if needed?
    // computePosition will handle it.

    cleanup = autoUpdate(node, tooltipElement, updatePosition);

    // Fade in
    requestAnimationFrame(() => {
      if (tooltipElement) tooltipElement.style.opacity = "1";
    });
  }

  function updatePosition() {
    if (!tooltipElement || !arrowElement) return;

    computePosition(node, tooltipElement, {
      placement: config.placement,
      middleware: [
        offset(10), // Gap
        flip(),
        shift({ padding: 5 }),
        arrow({ element: arrowElement }),
      ],
    }).then(({ x, y, placement, middlewareData }) => {
      Object.assign(tooltipElement!.style, {
        left: `${x}px`,
        top: `${y}px`,
      });

      const { x: arrowX, y: arrowY } = middlewareData.arrow!;
      const staticSide = {
        top: "bottom",
        right: "left",
        bottom: "top",
        left: "right",
      }[placement.split("-")[0]]!;

      Object.assign(arrowElement!.style, {
        left: arrowX != null ? `${arrowX}px` : "",
        top: arrowY != null ? `${arrowY}px` : "",
        right: "",
        bottom: "",
        [staticSide]: "-5px", // Half arrow size + 1px approx
        // Rotation adjustment for border
        transform: `rotate(45deg)`,
        borderRight: "1px solid var(--border-color, #334155)",
        borderBottom: "1px solid var(--border-color, #334155)",
        borderLeft: "none",
        borderTop: "none",
      });

      // Adjust borders based on placement to ensure the arrow border matches the tooltip border
      // Top placement -> arrow at bottom -> needs bottom and right border (rotated 45deg, so bottom-right points down)
      if (placement.startsWith("top")) {
        arrowElement!.style.borderRight =
          "1px solid var(--border-color, #334155)";
        arrowElement!.style.borderBottom =
          "1px solid var(--border-color, #334155)";
        arrowElement!.style.borderLeft = "none";
        arrowElement!.style.borderTop = "none";
      } else if (placement.startsWith("bottom")) {
        // Bottom placement -> arrow at top -> needs top and left border (rotated 45deg... wait)
        // Rotated 45deg:
        //   / \
        //   \ /  <-- this corner is bottom-right.
        //
        // We want the arrow to merge with the box.
        // If tooltip is at bottom, arrow is at top. Arrow points UP.
        // The corner pointing UP is Top-Left in 45deg rotation.
        arrowElement!.style.borderTop =
          "1px solid var(--border-color, #334155)";
        arrowElement!.style.borderLeft =
          "1px solid var(--border-color, #334155)";
        arrowElement!.style.borderRight = "none";
        arrowElement!.style.borderBottom = "none";
      } else if (placement.startsWith("left")) {
        // Left placement -> arrow at right. Arrow points RIGHT.
        // Corner pointing RIGHT is Top-Right or Bottom-Right?
        // 45deg:
        //   Box
        //    ^
        // Top-Left is Top, Top-Right is Right, Bottom-Right is Bottom, Bottom-Left is Left.
        // Arrow pointing Right (into the reference) needs to show its "back" to the tooltip? No.
        // Tooltip on Left. Arrow on Right side of tooltip. Pointing Right.
        // The "point" is the one outside the tooltip.
        // We want the borders on the OUTSIDE.
        // The arrow connects the tooltip to the element.
        // Tooltip (Left) --- Arrow ---> Element
        arrowElement!.style.borderTop =
          "1px solid var(--border-color, #334155)";
        arrowElement!.style.borderRight =
          "1px solid var(--border-color, #334155)";
        arrowElement!.style.borderLeft = "none";
        arrowElement!.style.borderBottom = "none";
      } else if (placement.startsWith("right")) {
        // Tooltip (Right) <--- Arrow --- Element
        // Arrow on left side of tooltip. Pointing Left.
        arrowElement!.style.borderBottom =
          "1px solid var(--border-color, #334155)";
        arrowElement!.style.borderLeft =
          "1px solid var(--border-color, #334155)";
        arrowElement!.style.borderRight = "none";
        arrowElement!.style.borderTop = "none";
      }
    });
  }

  function removeTooltip() {
    if (timer) clearTimeout(timer);
    if (cleanup) cleanup();
    if (tooltipElement) {
      tooltipElement.remove();
      tooltipElement = null;
    }
  }

  function onMouseEnter() {
    if (config.delay) {
      timer = setTimeout(createTooltip, config.delay);
    } else {
      createTooltip();
    }
  }

  function onMouseLeave() {
    if (timer) clearTimeout(timer);
    removeTooltip();
  }

  const events: [string, EventListener][] = [
    ["mouseenter", onMouseEnter],
    ["mouseleave", onMouseLeave],
    ["focus", onMouseEnter],
    ["blur", onMouseLeave],
  ];

  events.forEach(([event, listener]) => {
    node.addEventListener(event, listener);
  });

  return {
    update(newOptions: TooltipOptions | string) {
      updateConfig(newOptions);
    },
    destroy() {
      if (timer) clearTimeout(timer);
      events.forEach(([event, listener]) => {
        node.removeEventListener(event, listener);
      });
      removeTooltip();
    },
  };
}
