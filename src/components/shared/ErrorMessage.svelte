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
  BUG-0651 — the shared error surface.

  Two properties, and both are load-bearing:

  **The region is always in the DOM.** Only the text inside it is conditional.
  A live region has to exist before its content changes; one that is rendered
  together with its first message is announced inconsistently at best. So this
  element is never `{#if}`-ed away and never `hidden` — `display: none` takes
  it out of the accessibility tree, which is the same defect wearing a
  different hat.

  **Polite, not assertive.** Every other refusal in this codebase is
  `role="alert"` (PlaceOrderPanel's outcome banner, the alert panel's field
  refusals) and they stay that way. This surface is the exception because it is
  not only for refusals: `calculatorService.clearResults` writes
  `dashboard.promptForData` here on ordinary keystrokes, and an assertive
  region would interrupt the reader several times per sentence to say
  "please enter trade data". See the bug for the traced paths.

  `aria-atomic="false"`, stated explicitly. `role="status"` carries an
  implicit `aria-atomic="true"`, so the default here is *not* false — the
  attribute has to say so. Today it changes nothing, because the region holds
  nothing but the message and atomicity has no unrelated content to drag along.
  It matters the moment a second child is added: a timestamp, a retry count, a
  "details" link. With the default, all of it would be re-announced with every
  keystroke guidance.

  That is what makes the per-keystroke guidance safe: only *changed* text is
  announced. It is a property of Svelte's text write, which skips equal values.
  With the region permanently present, writing the same guidance twice mutates
  nothing and announces nothing. `ErrorMessage.component.test.ts` pins the
  write; see the bug's *Verification still owed* for the part a test could not
  reach.
-->

<script lang="ts">
    import { _ } from "../../locales/i18n";
    import { uiState } from "../../stores/ui.svelte";
    import type { TranslationKey } from "../../locales/schema";
</script>

<div
    id="error-message"
    role="status"
    aria-live="polite"
    aria-atomic="false"
    class="text-center text-sm font-medium"
    class:mt-4={uiState.showErrorMessage}
    style:color="var(--danger-color)"
>
    {#if uiState.showErrorMessage}
        <!--
            Carried over from the inline block this component replaces, unchanged:
            `uiState.errorMessage` is a plain `string` and the cast is not checked.
            It is sound in effect because svelte-i18n echoes a key it does not
            know, so the two kinds of writer survive the lookup — a real key
            translates, and raw third-party text (`+layout.svelte` forwards
            `window.error` and `unhandledrejection` verbatim, `PositionsSidebar`
            a cancel-order response, `JournalContent` an upload failure) comes
            back as itself rather than as a dotted path.

            A round-trip guard was tried here, as `PlaceOrderPanel.detailText`
            does for one field. It was a no-op: removing it left every test
            green, because svelte-i18n already echoes exactly the values the
            guard would have passed through. Reverted rather than shipped as a
            guard that reads like protection and protects nothing.
        -->
        {$_(uiState.errorMessage as TranslationKey)}
    {/if}
</div>