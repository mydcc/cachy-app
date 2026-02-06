<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!-- 
  Copyright (C) 2026 MYDCT
  Individual Toast Component
-->
<script lang="ts">
    import { onMount } from "svelte";
    import type { Toast } from "../../services/toastService.svelte";
    import { toastService } from "../../services/toastService.svelte";
    import { _ } from "../../locales/i18n";

    interface Props {
        toast: Toast;
    }

    let { toast }: Props = $props();

    let isVisible = $state(false);

    onMount(() => {
        // Small delay to trigger entry animation
        requestAnimationFrame(() => {
            isVisible = true;
        });
    });

    function close() {
        isVisible = false;
        // Wait for exit animation
        setTimeout(() => {
            toastService.remove(toast.id);
        }, 300);
    }

    // Icons based on type
    const icons = {
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        success: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        warning: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    };
</script>

<div class="toast-item {toast.type}" class:visible={isVisible} role="alert">
    <div class="icon">
        {@html icons[toast.type]}
    </div>
    <div class="content">
        {toast.message}
    </div>
    <button class="close-btn" onclick={close} aria-label={$_("common.close")}>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><line x1="18" y1="6" x2="6" y2="18" /><line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
            /></svg
        >
    </button>
</div>

<style>
    .toast-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px;
        background: var(--bg-secondary, #1e293b);
        border: 1px solid var(--border-color, #334155);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        color: var(--text-primary, #f8fafc);
        min-width: 300px;
        max-width: 400px;
        pointer-events: auto;

        /* Animation initial state */
        opacity: 0;
        transform: translateX(100%) scale(0.9);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

        /* Border left accent */
        border-left: 4px solid;
    }

    .toast-item.visible {
        opacity: 1;
        transform: translateX(0) scale(1);
    }

    .toast-item.info {
        border-left-color: var(--info-color, #3b82f6);
    }
    .toast-item.info .icon {
        color: var(--info-color, #3b82f6);
    }

    .toast-item.success {
        border-left-color: var(--success-color, #22c55e);
    }
    .toast-item.success .icon {
        color: var(--success-color, #22c55e);
    }

    .toast-item.warning {
        border-left-color: var(--warning-color, #eab308);
    }
    .toast-item.warning .icon {
        color: var(--warning-color, #eab308);
    }

    .toast-item.error {
        border-left-color: var(--danger-color, #ef4444);
    }
    .toast-item.error .icon {
        color: var(--danger-color, #ef4444);
    }

    .content {
        flex: 1;
        font-size: 0.95rem;
        line-height: 1.4;
        word-wrap: break-word;
    }

    .close-btn {
        background: transparent;
        border: none;
        color: var(--text-secondary, #94a3b8);
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s;
    }

    .close-btn:hover {
        color: var(--text-primary, #f8fafc);
    }
</style>
