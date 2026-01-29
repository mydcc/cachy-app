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
  import { modalState } from "../../stores/modal.svelte";
  import { _ } from "../../locales/i18n";
  import { trackClick } from "../../lib/actions";
  import { sanitizeHtml } from "../../utils/sanitizer";
  import ModalFrame from "./ModalFrame.svelte";

  // Use derived state for reactivity or just access properties directly in template
  // Since modalState.state is a Rune ($state), we can access it directly.
  let mState = $derived(modalState.state);

  function handleConfirm(result: boolean | string) {
    modalState.handleModalConfirm(result);
  }

  function handleInput(event: Event) {
    modalState.state.defaultValue = (event.target as HTMLInputElement).value;
  }
</script>

<ModalFrame
  isOpen={mState.isOpen && mState.type !== "symbolPicker"}
  title={mState.title}
  onclose={() => handleConfirm(false)}
  extraClasses={mState.extraClasses || "modal-size-sm"}
>
  <div class="prose dark:prose-invert w-full max-w-none">
    {@html sanitizeHtml(mState.message)}
  </div>

  {#if mState.type === "prompt"}
    <input
      id="modal-prompt-input"
      name="modalPromptInput"
      type="text"
      class="input-field w-full px-3 py-2 rounded-md my-4"
      placeholder={$_("dashboard.customModal.promptPlaceholder")}
      bind:value={modalState.state.defaultValue}
      oninput={handleInput}
    />
  {/if}

  <div class="flex justify-end gap-4 mt-6">
    {#if mState.type === "confirm"}
      <button
        class="font-bold py-2 px-4 rounded-lg bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover-bg)] text-[var(--btn-danger-text)]"
        onclick={() => handleConfirm(true)}
        use:trackClick={{
          category: "CustomModal",
          action: "Click",
          name: "ConfirmYes",
        }}>{$_("dashboard.customModal.yesButton")}</button
      >
      <button
        class="font-bold py-2 px-4 rounded-lg bg-[var(--btn-default-bg)] hover:bg-[var(--btn-default-hover-bg)] text-[var(--btn-default-text)]"
        onclick={() => handleConfirm(false)}
        use:trackClick={{
          category: "CustomModal",
          action: "Click",
          name: "ConfirmNo",
        }}>{$_("dashboard.customModal.noButton")}</button
      >
    {:else}
      <button
        class="btn-modal-ok font-bold py-2 px-4 rounded-lg"
        onclick={() =>
          handleConfirm(
            mState.type === "prompt" ? mState.defaultValue || "" : true,
          )}
        use:trackClick={{
          category: "CustomModal",
          action: "Click",
          name: "ConfirmOK",
        }}>{$_("dashboard.customModal.okButton")}</button
      >
    {/if}
  </div>
</ModalFrame>
