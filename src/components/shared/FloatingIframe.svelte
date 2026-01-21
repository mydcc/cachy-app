<script lang="ts">
    import { uiState } from "../../stores/ui.svelte";
    import interact from "interactjs";
    import { fade } from "svelte/transition";
    import { _ } from "../../locales/i18n";

    let containerEl: HTMLDivElement | undefined = $state();

    $effect(() => {
        if (!containerEl || !uiState.iframeModal.visible) return;

        const interaction = interact(containerEl)
            .draggable({
                allowFrom: ".iframe-header",
                listeners: {
                    move(event) {
                        uiState.iframeModal.x += event.dx;
                        uiState.iframeModal.y += event.dy;
                    },
                },
                modifiers: [
                    interact.modifiers.restrictRect({
                        restriction: "parent",
                        endOnly: true,
                    }),
                ],
            })
            .resizable({
                edges: { left: true, right: true, bottom: true, top: true },
                listeners: {
                    move(event) {
                        uiState.iframeModal.width = event.rect.width;
                        uiState.iframeModal.height = event.rect.height;
                        uiState.iframeModal.x += event.deltaRect.left;
                        uiState.iframeModal.y += event.deltaRect.top;
                    },
                },
                modifiers: [
                    interact.modifiers.aspectRatio({
                        ratio: 16 / 9,
                    }),
                    interact.modifiers.restrictSize({
                        min: { width: 320, height: 180 },
                        max: { width: 768, height: 432 },
                    }),
                    interact.modifiers.restrictEdges({
                        outer: "parent",
                    }),
                ],
            });

        return () => {
            interaction.unset();
        };
    });

    function close() {
        uiState.toggleIframeModal(false);
    }
</script>

{#if uiState.iframeModal.visible}
    <div
        bind:this={containerEl}
        class="fixed z-[70] flex flex-col bg-black overflow-hidden shadow-2xl border border-[var(--border-color)] group"
        transition:fade={{ duration: 200 }}
        style="
      width: {uiState.iframeModal.width}px;
      height: {uiState.iframeModal.height}px;
      left: {uiState.iframeModal.x}px;
      top: {uiState.iframeModal.y}px;
      border-radius: 8px;
    "
    >
        <!-- Header/Titelleiste -->
        <div
            class="iframe-header h-8 flex items-center justify-between px-3 bg-[#111] border-b border-[#222] cursor-move shrink-0"
        >
            <div class="flex items-center gap-2 truncate mr-4">
                <span class="text-amber-500 text-xs">📺</span>
                <span
                    class="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] truncate"
                >
                    {uiState.iframeModal.title || "Floating Window"}
                </span>
            </div>
            <button
                class="text-[var(--text-secondary)] hover:text-white transition-colors p-1"
                onclick={close}
                aria-label="Close"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>

        <!-- Content/Iframe -->
        <div class="flex-1 w-full bg-black relative">
            <iframe
                src={uiState.iframeModal.url}
                title={uiState.iframeModal.title}
                class="w-full h-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
            ></iframe>

            <!-- Overlay for visual feedback when resizing / dragging (optional) -->
            <div
                class="absolute inset-0 pointer-events-none border border-transparent group-hover:border-[var(--accent-color)]/20 transition-colors rounded-b-lg"
            ></div>
        </div>
    </div>
{/if}

<style>
    .iframe-header {
        user-select: none;
        backdrop-filter: blur(10px);
    }
</style>
