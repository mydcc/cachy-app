<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { trackClick, type TrackClickParams } from "../../actions/tracking";

  type ButtonVariant =
    | "default"
    | "accent"
    | "danger"
    | "success"
    | "warning"
    | "ghost"
    | "ghost-danger"
    | "ghost-muted"
    | "outline"
    | "outline-accent";
  type ButtonSize = "xs" | "sm" | "md" | "lg";

  interface Props {
    /** Colour role. The filled variants map to the `--btn-*` pairs; the text
     *  variants (`ghost`, `ghost-danger`, `ghost-muted`) use the semantic
     *  `--accent-color` / `--danger-color` / `--text-secondary` tokens. */
    variant?: ButtonVariant;
    /** Three heights, all read from the FEAT-0609 control tokens. */
    size?: ButtonSize;
    id?: string;
    title?: string;
    ariaLabel?: string;
    /**
     * Disclosure state for the button itself. The two settings disclosures
     * (engine debug history, order-audit entry) needed it, and escaping them
     * for a missing passthrough was the alternative (FEAT-0611 stage 2).
     */
    ariaExpanded?: boolean;
    ariaControls?: string;
    /**
     * Toggle state for a button that switches a mode (FEAT-0742's keep-above
     * control). Separate from `ariaExpanded`, which describes a disclosure.
     */
    ariaPressed?: boolean;
    onClick?: (event: MouseEvent) => void;
    oncontextmenu?: (event: MouseEvent) => void;
    /**
     * The window chrome buttons sit inside the drag handle, so they have to
     * swallow the header's double-click-to-maximise themselves (FEAT-0613).
     */
    ondblclick?: (event: MouseEvent) => void;
    children?: import("svelte").Snippet;
    /**
     * Layout-only classes. The primitive's rules live unlayered in
     * `themes.css`, so a Tailwind utility here cannot override its geometry
     * (`height`, `padding`, `display`) — wrap the button instead, the way the
     * header does for its responsive hide.
     */
    extraClasses?: string;
    disabled?: boolean;
    /**
     * BUG-0712 — unavailable without leaving the tab order.
     *
     * A native `disabled` button is skipped by Tab, so the reason it would give
     * is unreachable by keyboard. `aria-disabled` keeps it focusable and
     * announces the state, and the click guard here makes the state true rather
     * than decorative. The caller owns the visible/announced reason.
     */
    ariaDisabled?: boolean;
    type?: "button" | "submit" | "reset";
    /** Optional analytics action; the click still fires `onClick` without it. */
    track?: TrackClickParams;
  }

  let {
    variant = "default",
    size = "md",
    id,
    title,
    ariaLabel,
    ariaExpanded,
    ariaControls,
    ariaPressed,
    onClick,
    oncontextmenu,
    ondblclick,
    children,
    extraClasses = "",
    disabled = false,
    ariaDisabled = false,
    type = "button",
    track,
  }: Props = $props();

  function handleClick(event: MouseEvent) {
    // aria-disabled has to refuse the press itself; announcing it without the
    // guard would be a label on a button that still acts.
    if (ariaDisabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }
</script>

<button
  class="btn-base btn-{variant} btn-{size} {extraClasses}"
  {id}
  {disabled}
  aria-disabled={ariaDisabled ? "true" : undefined}
  {type}
  onclick={handleClick}
  oncontextmenu={oncontextmenu}
  ondblclick={ondblclick}
  {title}
  aria-label={ariaLabel || title}
  aria-expanded={ariaExpanded}
  aria-controls={ariaControls}
  aria-pressed={ariaPressed}
  use:trackClick={ariaDisabled ? undefined : track}
>
  {#if children}
    {@render children()}
  {/if}
</button>

