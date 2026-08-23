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

<!--
  Test stand-in for `ModalFrame.svelte`.

  The real `ModalFrame` (FEAT-0044) renders no markup of its own: it registers
  a `ModalFrameWindow` with the shared `WindowManager`, and `WindowContainer`
  renders the frame — and invokes the `children` snippet — somewhere else in
  the tree entirely. That is the right design for the app and it means a
  component test that mounts a modal in isolation gets an empty container: the
  snippet is never invoked, so *nothing* under the modal renders, and an
  assertion like `expect(x).toBeNull()` passes for the wrong reason.

  This renders the snippet where it was declared, so a test can mount a modal's
  own content and drive it. It deliberately implements nothing else — a test
  that needs the real window stacking, focus or backdrop behaviour should mount
  `WindowContainer` rather than reach for this.

  Use with:

      vi.mock("./ModalFrame.svelte", async () => ({
          default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
      }));
-->

<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        isOpen?: boolean;
        title?: string;
        children?: Snippet;
        headerExtra?: Snippet;
        onclose?: () => void;
        [key: string]: unknown;
    }

    let { isOpen = true, title = "", children, headerExtra }: Props = $props();
</script>

{#if isOpen}
    <div data-testid="modal-frame-stub" aria-label={title}>
        {@render headerExtra?.()}
        {@render children?.()}
    </div>
{/if}
