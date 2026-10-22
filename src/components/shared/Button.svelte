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
  type ButtonSize = "sm" | "md" | "lg";

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
    onClick?: (event: MouseEvent) => void;
    oncontextmenu?: (event: MouseEvent) => void;
    children?: import("svelte").Snippet;
    /**
     * Layout-only classes. The primitive's rules live unlayered in
     * `themes.css`, so a Tailwind utility here cannot override its geometry
     * (`height`, `padding`, `display`) — wrap the button instead, the way the
     * header does for its responsive hide.
     */
    extraClasses?: string;
    disabled?: boolean;
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
    onClick,
    oncontextmenu,
    children,
    extraClasses = "",
    disabled = false,
    type = "button",
    track,
  }: Props = $props();
</script>

<button
  class="btn-base btn-{variant} btn-{size} {extraClasses}"
  {id}
  {disabled}
  {type}
  onclick={onClick}
  oncontextmenu={oncontextmenu}
  {title}
  aria-label={ariaLabel || title}
  aria-expanded={ariaExpanded}
  aria-controls={ariaControls}
  use:trackClick={track}
>
  {#if children}
    {@render children()}
  {/if}
</button>

