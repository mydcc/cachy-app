<!-- 
  Copyright (C) 2026 MYDCT
  Toast Container
  Holds and positions toast notifications.
-->
<script lang="ts">
    import { toastService } from "../../services/toastService.svelte";
    import ToastItem from "./ToastItem.svelte";
</script>

<div class="toast-container">
    {#each toastService.toasts as toast (toast.id)}
        <ToastItem {toast} />
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 10000; /* High z-index to stay on top of everything */
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none; /* Let clicks pass through empty areas */
        max-height: 100vh;
        overflow: hidden;
    }

    @media (max-width: 640px) {
        .toast-container {
            top: auto;
            bottom: 24px;
            right: 16px;
            left: 16px;
            align-items: center;
        }
    }
</style>
