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
  import { onMount, untrack } from "svelte";
  import { fly, scale } from "svelte/transition";
  import { chatState } from "../../stores/chat.svelte";
  import { notesState } from "../../stores/notes.svelte";
  import { aiState } from "../../stores/ai.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { floatingWindowsStore } from "../../stores/floatingWindows.svelte";
  import { _ } from "../../locales/i18n";
  import { icons } from "../../lib/constants";

  import AiPanel from "./sidepanel/AiPanel.svelte";
  import NotesPanel from "./sidepanel/NotesPanel.svelte";
  import ChatPanel from "./sidepanel/ChatPanel.svelte";

  let isOpen = $state(false);
  let isInteracting = $state(false);
  let currentZIndex = $state(floatingWindowsStore.requestZIndex());

  function bringToFront() {
    currentZIndex = floatingWindowsStore.requestZIndex();
  }

  $effect(() => {
    if (isOpen) {
      untrack(() => bringToFront());
    }
  });

  function toggle() {
    isOpen = !isOpen;
  }

  function getPanelTitle(mode: string) {
    if (mode === "chat") return $_("sidePanel.globalChat");
    if (mode === "notes") return $_("sidePanel.myNotes");
    if (mode === "ai") return $_("sidePanel.aiAssistant");
    return "Side Panel";
  }

  // Reactive layout variables
  let layout = $derived(settingsState.sidePanelLayout || "floating");
  let isFloating = $derived(layout === "floating");
  let isSidebar = $derived(!isFloating); // Standard

  let styleMode = $derived(settingsState.chatStyle || "minimal"); // minimal, bubble, terminal
  let isTerminal = $derived(styleMode === "terminal");

  // Panel State (Position & Size) - use settingsState.panelState directly
  let panelEl: HTMLDivElement | undefined = $state();

  function sanitizePanelState() {
    if (!settingsState.panelState) {
      settingsState.panelState = { width: 450, height: 550, x: 20, y: 20 };
      return;
    }
    // Ensure numbers are valid
    if (isNaN(settingsState.panelState.x)) settingsState.panelState.x = 20;
    if (isNaN(settingsState.panelState.y)) settingsState.panelState.y = 20;
    if (
      isNaN(settingsState.panelState.width) ||
      settingsState.panelState.width < 300
    )
      settingsState.panelState.width = 450;
    if (
      isNaN(settingsState.panelState.height) ||
      settingsState.panelState.height < 200
    )
      settingsState.panelState.height = 550;
  }

  $effect(() => {
    // Sanitize constantly to prevent NaN propagation
    sanitizePanelState();
  });

  $effect(() => {
    if (!panelEl || !isSidebar) return;

    let interaction: any;

    const initInteract = async () => {
      const { default: interact } = await import("interactjs");
      interaction = interact(panelEl!).resizable({
        edges: { right: true },
        listeners: {
          start() {
            isInteracting = true;
          },
          move(event) {
            settingsState.panelState.width = event.rect.width;
          },
          end() {
            isInteracting = false;
          },
        },
        modifiers: [
          interact.modifiers.restrictSize({
            min: { width: 300, height: 100 },
          }),
        ],
      });
    };

    initInteract();
    return () => {
      if (interaction) interaction.unset();
    };
  });

  // Floating mode interaction
  $effect(() => {
    if (!panelEl || !isFloating || settingsState.panelIsExpanded) return;

    let dragInteraction: any;
    let resizeInteraction: any;

    const initInteract = async () => {
      const { default: interact } = await import("interactjs");
      // Separate draggable and resizable to prevent chaining conflicts
      dragInteraction = interact(panelEl!).draggable({
        allowFrom: ".drag-handle",
        listeners: {
          start() {
            isInteracting = true;
          },
          move(event) {
            settingsState.panelState.x += event.dx;
            settingsState.panelState.y += event.dy;
          },
          end() {
            isInteracting = false;
          },
        },
        modifiers: [
          // Modifier entfernt, da restriction: 'parent' das Springen verursacht
        ],
      });

      resizeInteraction = interact(panelEl!).resizable({
        // Explicitly define edges for floating mode
        edges: { left: true, right: true, bottom: true, top: true },
        margin: 6, // Reduce resize activation zone to prevent conflict with drag handle
        listeners: {
          start() {
            isInteracting = true;
          },
          move(event) {
            // Update width/height AND position for left/top resize
            settingsState.panelState.width = event.rect.width;
            settingsState.panelState.height = event.rect.height;
            settingsState.panelState.x += event.deltaRect.left;
            settingsState.panelState.y += event.deltaRect.top;
          },
          end() {
            isInteracting = false;
          },
        },
        modifiers: [
          interact.modifiers.restrictSize({
            min: { width: 300, height: 200 },
          }),
        ],
      });
    };

    initInteract();

    return () => {
      if (dragInteraction) dragInteraction.unset();
      if (resizeInteraction) resizeInteraction.unset();
    };
  });

  function exportChat() {
    let content = "";
    if (settingsState.sidePanelMode === "ai") {
      content = aiState.messages
        .map(
          (m) =>
            `${m.role === "user" ? "YOU" : "AI"} (${new Date(m.timestamp).toLocaleString()}):\n${m.content}\n`,
        )
        .join("\n---\n\n");
    } else if (settingsState.sidePanelMode === "notes") {
      content = notesState.messages
        .map((m) => `${new Date(m.timestamp).toLocaleString()}:\n${m.text}\n`)
        .join("\n---\n\n");
    } else {
      content = chatState.messages
        .map(
          (m) =>
            `${m.senderId === "me" ? "YOU" : "USER"} (${m.profitFactor ? "PF: " + m.profitFactor.toFixed(2) : "N/A"}) (${new Date(m.timestamp).toLocaleString()}):\n${m.text}\n`,
        )
        .join("\n---\n\n");
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cachy-chat-export-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function cycleMode() {
    const modes: ("ai" | "notes" | "chat")[] = ["ai", "notes", "chat"];
    const currentIdx = modes.indexOf(settingsState.sidePanelMode);
    const nextIdx = (currentIdx + 1) % modes.length;
    settingsState.sidePanelMode = modes[nextIdx];
  }

  function clampPanelPosition() {
    if (
      typeof window === "undefined" ||
      !settingsState.panelState ||
      !isFloating
    )
      return;

    const { innerWidth, innerHeight } = window;
    let { x, y, width, height } = settingsState.panelState;

    // Safety bounds: Ensure panel is fully reachable
    const maxX = Math.max(0, innerWidth - width);
    const maxY = Math.max(0, innerHeight - height);

    let newX = Math.max(0, Math.min(x, maxX));
    let newY = Math.max(0, Math.min(y, maxY));

    if (newX !== x || newY !== y) {
      settingsState.panelState.x = newX;
      settingsState.panelState.y = newY;
    }
  }

  onMount(() => {
    // Check bounds on init only
    clampPanelPosition();
  });

  function toggleExpand() {
    settingsState.panelIsExpanded = !settingsState.panelIsExpanded;
    // Slight delay to allow transition then check bounds
    setTimeout(clampPanelPosition, 350);
  }
</script>

{#if settingsState.enableSidePanel}
  <div
    class="fixed pointer-events-none transition-all duration-300 flex"
    style="z-index: {currentZIndex};"
    class:bottom-4={isFloating}
    class:left-4={isFloating}
    class:flex-col-reverse={isFloating}
    class:items-start={isFloating}
    class:left-0={isSidebar}
    class:top-0={isSidebar}
    class:h-full={isSidebar}
    class:flex-row={isSidebar}
  >
    <!-- TRIGGER BUTTON / STRIP -->
    <div
      class="pointer-events-auto"
      onmousedown={bringToFront}
      onclick={toggle}
      role="button"
      tabindex="0"
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
    >
      {#if isSidebar}
        <!-- Configurable Sidebar Strip -->
        <div
          class="h-full w-10 bg-[var(--bg-tertiary)] border-r border-[var(--border-color)] flex flex-col items-center py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors outline-none focus:bg-[var(--bg-secondary)] shadow-lg"
          title={getPanelTitle(settingsState.sidePanelMode)}
        >
          <div class="mb-4 text-[var(--text-primary)]">
            {#if settingsState.sidePanelMode === "ai"}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path
                  d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2m0 2a8 8 0 0 0-8 8 8 8 0 0 0 8 8 8 8 0 0 0 8-8 8 8 0 0 0-8-8"
                /><path d="m9 12 2 2 4-4" /></svg
              >
            {:else if settingsState.sidePanelMode === "notes"}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path
                  d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg
              >
            {:else}
              {@html icons.messageSquare}
            {/if}
          </div>
          <div
            class="text-[10px] uppercase font-bold text-[var(--text-secondary)] writing-vertical-lr transform rotate-180"
          >
            {getPanelTitle(settingsState.sidePanelMode)}
          </div>
        </div>
      {:else if !isOpen}
        <!-- Floating FAB Trigger -->
        <button
          class="w-12 h-12 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-full shadow-lg flex items-center justify-center hover:bg-[var(--bg-secondary)] hover:scale-105 hover:border-[var(--accent-color)] transition-all duration-200"
          title={getPanelTitle(settingsState.sidePanelMode)}
          in:scale={{ duration: 200 }}
        >
          <div class="text-[var(--text-primary)]">
            {#if settingsState.sidePanelMode === "ai"}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path
                  d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2m0 2a8 8 0 0 0-8 8 8 8 0 0 0 8 8 8 8 0 0 0 8-8 8 8 0 0 0-8-8"
                /><path d="m9 12 2 2 4-4" /></svg
              >
            {:else if settingsState.sidePanelMode === "notes"}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path
                  d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg
              >
            {:else}
              {@html icons.messageSquare}
            {/if}
          </div>
          {#if chatState.messages.some((m) => m.senderId !== "me" && new Date(m.timestamp).getTime() > Date.now() - 5000)}
            <span
              class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"
            ></span>
          {/if}
        </button>
      {/if}
    </div>

    <!-- MAIN PANEL -->
    {#if isOpen}
      <div
        bind:this={panelEl}
        in:fly={{ x: isSidebar ? -50 : 0, y: isFloating ? 20 : 0, duration: 300 }}
        class="bg-[var(--bg-tertiary)] flex flex-col shadow-2xl overflow-hidden panel-border pointer-events-auto"
        class:is-interacting={isInteracting}
        class:fixed={isFloating}
        class:relative={isSidebar}
        class:rounded-xl={isFloating}
        class:w-full={settingsState.panelIsExpanded}
        class:h-full={settingsState.panelIsExpanded}
        class:!top-0={settingsState.panelIsExpanded}
        class:!left-0={settingsState.panelIsExpanded}
        class:z-[100]={settingsState.panelIsExpanded}
        style:width={!settingsState.panelIsExpanded
          ? settingsState.panelState.width + "px"
          : "100%"}
        style:height={!settingsState.panelIsExpanded && isFloating
          ? settingsState.panelState.height + "px"
          : isSidebar
            ? "100%"
            : "100%"}
        style:transform={isFloating && !settingsState.panelIsExpanded
          ? `translate(${settingsState.panelState.x}px, ${settingsState.panelState.y}px)`
          : ""}
        onmousedown={bringToFront}
        role="dialog"
        aria-modal="false"
        tabindex="-1"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between p-3 border-b border-[var(--border-color)] shrink-0 drag-handle cursor-move select-none"
          class:cursor-default={isSidebar}
          ondblclick={() => isFloating && toggleExpand()}
          role="group"
        >
          <div class="flex items-center gap-2">
            <button
              class="hover:text-[var(--accent-color)] transition-colors font-bold text-sm flex items-center gap-2"
              onclick={cycleMode}
              title={getPanelTitle(settingsState.sidePanelMode)}
            >
              {#if settingsState.sidePanelMode === "ai"}
                <span class="text-[var(--accent-color)]">✦</span>
              {:else if settingsState.sidePanelMode === "notes"}
                <span class="text-[var(--accent-color)]">✎</span>
              {:else}
                <span class="text-[var(--accent-color)]">💬</span>
              {/if}
              {getPanelTitle(settingsState.sidePanelMode)}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <!-- Mode Switcher (Icons) -->
            <div class="flex bg-[var(--bg-secondary)] rounded-lg p-0.5 mr-2">
              <button
                class="p-1 rounded hover:bg-[var(--bg-primary)] transition-colors {settingsState.sidePanelMode ===
                'ai'
                  ? 'text-[var(--accent-color)] bg-[var(--bg-primary)]'
                  : 'text-[var(--text-secondary)]'}"
                onclick={() => (settingsState.sidePanelMode = "ai")}
                title={$_("sidePanel.aiAssistant")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><path
                    d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2m0 2a8 8 0 0 0-8 8 8 8 0 0 0 8 8 8 8 0 0 0 8-8 8 8 0 0 0-8-8"
                  /><path d="m9 12 2 2 4-4" /></svg
                >
              </button>
              <button
                class="p-1 rounded hover:bg-[var(--bg-primary)] transition-colors {settingsState.sidePanelMode ===
                'notes'
                  ? 'text-[var(--accent-color)] bg-[var(--bg-primary)]'
                  : 'text-[var(--text-secondary)]'}"
                onclick={() => (settingsState.sidePanelMode = "notes")}
                title={$_("sidePanel.myNotes")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  ><path
                    d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                  /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg
                >
              </button>
              <button
                class="p-1 rounded hover:bg-[var(--bg-primary)] transition-colors {settingsState.sidePanelMode ===
                'chat'
                  ? 'text-[var(--accent-color)] bg-[var(--bg-primary)]'
                  : 'text-[var(--text-secondary)]'}"
                onclick={() => (settingsState.sidePanelMode = "chat")}
                title={$_("sidePanel.globalChat")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  ><line x1="12" y1="5" x2="12" y2="19" /><line
                    x1="5"
                    y1="12"
                    x2="19"
                    y2="12"
                  /></svg
                >
              </button>
            </div>

            <!-- Export Button -->
            <button
              class="hover:text-[var(--text-primary)] transition-colors p-0.5"
              class:text-green-700={isTerminal}
              class:hover:text-green-300={isTerminal}
              onclick={exportChat}
              ondblclick={(e) => e.stopPropagation()}
              title={$_("sidePanel.exportChat") || "Export Chat"}
              aria-label={$_("sidePanel.exportChat") || "Export Chat"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" /><polyline
                  points="7 10 12 15 17 10"
                /><line x1="12" y1="15" x2="12" y2="3" /></svg
              >
            </button>

            <!-- Expand / Shrink -->
            <button
              class="hover:text-[var(--text-primary)] transition-colors p-0.5"
              class:text-green-700={isTerminal}
              class:hover:text-green-300={isTerminal}
              onclick={toggleExpand}
              ondblclick={(e) => e.stopPropagation()}
              title={settingsState.panelIsExpanded
                ? ($_("sidePanel.collapse") || "Collapse Panel")
                : ($_("sidePanel.expand") || "Expand Panel")}
              aria-label={settingsState.panelIsExpanded
                ? ($_("sidePanel.collapse") || "Collapse Panel")
                : ($_("sidePanel.expand") || "Expand Panel")}
            >
              {#if settingsState.panelIsExpanded}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><polyline points="4 14 10 14 10 20" /><polyline
                    points="20 10 14 10 14 4"
                  /><line x1="14" y1="10" x2="21" y2="3" /><line
                    x1="3"
                    y1="21"
                    x2="10"
                    y2="14"
                  /></svg
                >
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><polyline points="15 3 21 3 21 9" /><polyline
                    points="9 21 3 21 3 15"
                  /><line x1="21" y1="3" x2="14" y2="10" /><line
                    x1="3"
                    y1="21"
                    x2="10"
                    y2="14"
                  /></svg
                >
              {/if}
            </button>

            <button
              class="transition-colors hover:text-red-500 p-0.5"
              class:text-green-700={isTerminal}
              class:text-[var(--text-secondary)]={!isTerminal}
              onclick={() => {
                const mode = settingsState.sidePanelMode;
                const confirmClear = settingsState.aiConfirmClear;

                const clearFn = () => {
                  if (mode === "ai") aiState.clearHistory();
                  else if (mode === "notes") notesState.clearNotes();
                  else chatState.clearHistory();
                };

                if (confirmClear) {
                  if (confirm($_("sidePanel.clearConfirm") || "Clear history?")) {
                    clearFn();
                  }
                } else {
                  clearFn();
                }
              }}
              ondblclick={(e) => e.stopPropagation()}
              title={$_("sidePanel.clearHistory") || "Clear History"}
              aria-label={$_("sidePanel.clearHistory") || "Clear History"}
            >
              <!-- TRASH ICON -->
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><polyline points="3 6 5 6 21 6" /><path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                /></svg
              >
            </button>
            <button
              class="transition-colors p-0.5"
              class:text-green-500={isTerminal}
              class:text-[var(--text-secondary)]={!isTerminal}
              class:hover:text-[var(--text-primary)]={!isTerminal}
              class:hover:text-green-300={isTerminal}
              aria-label={$_("common.close") || "Close"}
              title={$_("common.close") || "Close"}
              onclick={toggle}
              ondblclick={(e) => e.stopPropagation()}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                /></svg
              >
            </button>
          </div>
        </div>

        <!-- CONTENT -->
        {#if settingsState.sidePanelMode === "ai"}
          <AiPanel />
        {:else if settingsState.sidePanelMode === "notes"}
          <NotesPanel />
        {:else}
          <ChatPanel />
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .is-interacting {
    transition: none !important;
    user-select: none !important;
  }

  .writing-vertical-lr {
    writing-mode: vertical-lr;
    text-orientation: mixed;
  }

  /* Panel Border */
  .panel-border {
    border: 1px solid var(--border-color);
  }

  .is-interacting.panel-border {
    border-color: var(--accent-color);
  }
</style>
