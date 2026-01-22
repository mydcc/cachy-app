<script lang="ts">
    import interact from "interactjs";
    import { fade } from "svelte/transition";
    import { _ } from "../../locales/i18n";

    interface Props {
        iframeState: {
            visible: boolean;
            url: string;
            title: string;
            width: number;
            height: number;
            x: number;
            y: number;
        };
        onClose: () => void;
    }

    let { iframeState, onClose }: Props = $props();

    let containerEl: HTMLDivElement | undefined = $state();
    let isInteracting = $state(false);

    $effect(() => {
        if (!containerEl || !iframeState.visible) return;

        const interaction = interact(containerEl)
            .draggable({
                allowFrom: ".iframe-header",
                listeners: {
                    start() {
                        isInteracting = true;
                    },
                    move(event) {
                        iframeState.x += event.dx;
                        iframeState.y += event.dy;
                    },
                    end() {
                        isInteracting = false;
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
                edges: { left: true, right: true, bottom: true, top: false }, // Verhindere Top-Resize um Header-Drag zu schützen
                listeners: {
                    start() {
                        isInteracting = true;
                    },
                    move(event) {
                        iframeState.width = event.rect.width;
                        iframeState.height = event.rect.height;
                        iframeState.x += event.deltaRect.left;
                        iframeState.y += event.deltaRect.top;
                    },
                    end() {
                        isInteracting = false;
                    },
                },
                modifiers: [
                    interact.modifiers.restrictSize({
                        min: { width: 320, height: 180 },
                        max: { width: 1600, height: 900 },
                    }),
                    interact.modifiers.restrictEdges({
                        outer: "parent",
                    }),
                    interact.modifiers.aspectRatio({
                        ratio: 768 / 465,
                    }),
                ],
            });

        return () => {
            interaction.unset();
        };
    });
</script>

{#if iframeState.visible}
    <div
        bind:this={containerEl}
        class="fixed z-[70] flex flex-col bg-black overflow-hidden shadow-2xl border border-[var(--border-color)] group"
        class:is-interacting={isInteracting}
        transition:fade={{ duration: 200 }}
        style="
      width: {iframeState.width}px;
      height: {iframeState.height}px;
      left: {iframeState.x}px;
      top: {iframeState.y}px;
      border-radius: 8px;
      touch-action: none;
    "
    >
        <!-- Header/Titelleiste -->
        <div
            class="iframe-header h-8 flex items-center justify-between px-3 bg-[#111] border-b border-[#222] cursor-move shrink-0 select-none"
        >
            <div
                class="flex items-center gap-2 truncate mr-4 pointer-events-none"
            >
                <span class="text-amber-500 text-xs">🚀</span>
                <span
                    class="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] truncate"
                >
                    {iframeState.title || "Cachy Space"}
                </span>
            </div>
            <button
                class="text-[var(--text-secondary)] hover:text-white transition-colors p-1"
                onclick={onClose}
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
                src={iframeState.url ||
                    "https://space.cachy.app/index.php?plot_id=genesis"}
                title={iframeState.title}
                class="w-full h-full border-none"
                class:pointer-events-none={isInteracting}
                allow="xr-spatial-tracking; camera; microphone; fullscreen; display-capture; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
            ></iframe>

            <!-- Visual Resizing indicator for bottom corners -->
            <div
                class="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <svg
                    viewBox="0 0 10 10"
                    class="w-full h-full fill-[var(--accent-color)] opacity-40"
                >
                    <path d="M 0 10 L 10 10 L 10 0 Z" />
                </svg>
            </div>
        </div>
    </div>
{/if}

<style>
    .iframe-header {
        user-select: none;
        backdrop-filter: blur(10px);
    }

    /* Disable transitions while interacting to prevent the "laggy/rubber-band" effect */
    .is-interacting {
        transition: none !important;
    }
</style>
