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

  type ButtonVariant = "default" | "accent" | "danger" | "success";
  type ButtonSize = "sm" | "md" | "lg";

  interface Props {
    /** Colour role, mapped to the existing `--btn-*` pairs — no new colours. */
    variant?: ButtonVariant;
    /** Three heights, all read from the FEAT-0609 control tokens. */
    size?: ButtonSize;
    id?: string;
    title?: string;
    ariaLabel?: string;
    onClick?: () => void;
    oncontextmenu?: (event: MouseEvent) => void;
    children?: import("svelte").Snippet;
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
  use:trackClick={track}
>
  {#if children}
    {@render children()}
  {/if}
</button>

