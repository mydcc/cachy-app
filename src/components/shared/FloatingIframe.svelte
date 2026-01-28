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
    import { fade } from "svelte/transition";
    import { uiState } from "../../stores/ui.svelte";
    import { _ } from "../../locales/i18n";
    import { icons } from "../../lib/constants";
    import { burn } from "../../actions/burn";
    import { settingsState } from "../../stores/settings.svelte";

    interface Props {
        iframeState: {
            id: string;
            visible: boolean;
            url: string;
            title: string;
            width: number;
            height: number;
            x: number;
            y: number;
            zIndex: number;
        };
        onClose: () => void;
    }

    let { iframeState, onClose }: Props = $props();

    let containerEl: HTMLDivElement | undefined = $state();
    let iframeEl: HTMLIFrameElement | undefined = $state();
    let isInteracting = $state(false);
    let isMobile = $state(false);
    let iframeLoaded = $state(false);

    $effect(() => {
        const checkMobile = () => {
            if (typeof window !== "undefined") {
                isMobile = window.innerWidth <= 768;
            }
        };

        checkMobile();
        window.addEventListener("resize", checkMobile);

        return () => {
            window.removeEventListener("resize", checkMobile);
        };
    });

    // ✅ CRITICAL FIX: Lazy IFrame loading + Complete destruction on close
    // This ensures WebGL context is fully released from memory
    $effect(() => {
        if (!iframeState.visible) {
            // 🔴 WHEN CLOSING: Remove iframe DOM node completely
            // This triggers WebGL context destruction + garbage collection
            if (iframeEl) {
                iframeEl.src = "about:blank"; // Clear content first
                setTimeout(() => {
                    if (iframeEl?.parentNode) {
                        iframeEl.parentNode.removeChild(iframeEl);
                        iframeEl = undefined;
                        iframeLoaded = false;
                    }
                }, 100);
            }
            return;
        }

        // 🟢 WHEN OPENING: Create iframe dynamically (lazy loading)
        if (iframeState.visible && !iframeLoaded && containerEl) {
            const contentDiv = containerEl.querySelector(".iframe-content");
            if (contentDiv && !iframeEl) {
                const newIframe = document.createElement("iframe");
                newIframe.src =
                    iframeState.url ||
                    "https://space.cachy.app/index.php?plot_id=genesis";
                newIframe.title = iframeState.title;
                newIframe.className = "w-full h-full border-none";
                newIframe.allow =
                    "xr-spatial-tracking; pointer-lock; gamepad; camera; microphone; fullscreen; display-capture; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                newIframe.allowFullscreen = true;

                // Bind interacting state
                newIframe.style.pointerEvents = isInteracting ? "none" : "auto";

                contentDiv.appendChild(newIframe);
                iframeEl = newIframe;
                iframeLoaded = true;

                if (import.meta.env.DEV) {
                    console.log(
                        `[FloatingIframe] Lazy-loaded iframe: ${iframeState.id}`,
                    );
                }
            }
        }

        // Update pointer-events based on interaction state
        if (iframeEl) {
            iframeEl.style.pointerEvents = isInteracting ? "none" : "auto";
        }
    });

    $effect(() => {
        if (!containerEl || !iframeState.visible || isMobile) return;

        let interaction: any;

        const initInteract = async () => {
            const { default: interact } = await import("interactjs");
            interaction = interact(containerEl!)
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
                        }),
                    ],
                })
                .resizable({
                    edges: {
                        left: true,
                        right: true,
                        bottom: true,
                        top: false,
                    },
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
        };

        initInteract();

        return () => {
            if (interaction) interaction.unset();
        };
    });

    $effect(() => {
        const handleFsChange = () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
        };
        document.addEventListener("fullscreenchange", handleFsChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFsChange);
        };
    });

    // Determine burning configuration based on window title and settings
    let burnConfig = $derived.by(() => {
        if (!settingsState.enableBurningBorders) return null;

        const isNews = iframeState.title.toLowerCase().includes("news");
        const isChannel = iframeState.title.toLowerCase().includes("channel");

        if (isNews && settingsState.burnNewsWindows) {
            return { color: "#00d4ff", intensity: 1.5 }; // Cyan for News
        }
        if (isChannel && settingsState.burnChannelWindows) {
            return { color: "#ff8c00", intensity: 1.8 }; // Orange for Channel
        }

        // Default burn for other windows if enabled?
        // For now only if specifically requested or a generic setting (could add burnOtherWindows)
        return null;
    });
</script>

{#if iframeState.visible}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        bind:this={containerEl}
        use:burn={burnConfig || undefined}
        role="application"
        aria-label={iframeState.title}
        class="fixed z-[70] flex flex-col bg-black overflow-hidden shadow-2xl border border-[var(--border-color)] group"
        class:is-interacting={isInteracting}
        class:mobile-mode={isMobile}
        transition:fade={{ duration: 200 }}
        onmousedown={() => uiState.bringToFront(iframeState.id)}
        style={!isMobile
            ? `
      width: ${iframeState.width}px;
      height: ${iframeState.height}px;
      left: ${iframeState.x}px;
      top: ${iframeState.y}px;
      z-index: ${iframeState.zIndex};
      border-radius: 8px;
    `
            : ""}
    >
        <!-- Header/Titelleiste -->
        <div
            class="iframe-header h-8 flex items-center justify-between px-3 bg-[#111] border-b border-[#222] cursor-move shrink-0 select-none"
        >
            <div
                class="flex items-center gap-2 truncate mr-4 pointer-events-none"
            >
                <span class="text-amber-500 text-xs text-shadow-glow">🚀</span>
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
        <div class="iframe-content flex-1 w-full bg-black relative">
            <!-- IFrame wird dynamisch hier eingefügt via JavaScript -->
            <!-- Vorher: statisches <iframe> Tag (speichert WebGL in Memory)
                 Nachher: dynamisch erstellt beim Öffnen, vollständig gelöscht beim Schließen
            -->

            <!-- Visual Resizing indicator for bottom corners -->
            <div
                class="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
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

    .mobile-mode {
        top: 0 !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: min(182vh, 100vw) !important;
        aspect-ratio: 15/9 !important;
        height: auto !important; /* Let aspect ratio determine height */
        border-radius: 0 !important;
        touch-action: auto !important;
    }
</style>
