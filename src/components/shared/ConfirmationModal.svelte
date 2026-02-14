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
  import ModalFrame from "./ModalFrame.svelte";
  import Button from "./Button.svelte";
  import { _ } from "../../locales/i18n";

  interface Props {
    isOpen?: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onClose?: () => void;
    onConfirm?: () => void;
  }

  let {
    isOpen = false,
    title = "",
    message = "",
    confirmText = "",
    cancelText = "",
    onClose,
    onConfirm,
  }: Props = $props();

  function handleConfirm() {
    onConfirm?.();
    onClose?.();
  }

  function handleCancel() {
    onClose?.();
  }
</script>

<ModalFrame {isOpen} {title} onclose={handleCancel} extraClasses="w-full max-w-sm border border-[var(--border-color)] shadow-lg">
  <div class="flex flex-col gap-6 p-2">
    <p class="text-[var(--text-primary)] text-sm leading-relaxed">{message}</p>

    <div class="flex justify-end gap-3 pt-2">
      <!-- Cancel Button -->
      <button
        onclick={handleCancel}
        class="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 text-[var(--text-secondary)] rounded text-xs font-medium transition-colors border border-[var(--border-color)]"
      >
        {cancelText || $_("common.cancel")}
      </button>

      <!-- Confirm Button -->
      <button
        onclick={handleConfirm}
        class="px-4 py-2 bg-[var(--danger-color)] hover:opacity-90 text-white rounded text-xs font-bold transition-all shadow-md transform active:scale-95"
      >
        {confirmText || $_("common.confirm")}
      </button>
    </div>
  </div>
</ModalFrame>
