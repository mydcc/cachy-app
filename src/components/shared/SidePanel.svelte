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
  import { onMount } from "svelte";
  import { fly, scale } from "svelte/transition";
  import { chatState } from "../../stores/chat.svelte";
  import { notesState } from "../../stores/notes.svelte";
  import { aiState } from "../../stores/ai.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { tradeState } from "../../stores/trade.svelte";
  import { floatingWindowsStore } from "../../stores/floatingWindows.svelte";
  import { _ } from "../../locales/i18n";
  import { icons } from "../../lib/constants";
  import { marked } from "marked";
  // @ts-ignore
  import DOMPurify from "dompurify";

  let isOpen = $state(false);
  let inputEl: HTMLInputElement | HTMLTextAreaElement | undefined = $state();
  let messagesContainer: HTMLDivElement | undefined = $state();
  let messageText = $state("");
  let isSending = $state(false);
  let errorMessage = $state("");
  let isInteracting = $state(false);
  let currentZIndex = $state(floatingWindowsStore.requestZIndex());

  function bringToFront() {
    currentZIndex = floatingWindowsStore.requestZIndex();
  }

  $effect(() => {
    if (isOpen) {
      bringToFront();
    }
  });

  // Scroll to bottom on new messages
  $effect(() => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  // onMount init removed as chatState handles itself via effects

  let errorTimeout: ReturnType<typeof setTimeout> | undefined;

  async function handleSend() {
    if (!messageText.trim()) return;

    isSending = true;
    errorMessage = "";
    const mode = settingsState.sidePanelMode;

    try {
      if (mode === "ai") {
        await aiState.sendMessage(messageText);
      } else if (mode === "notes") {
        notesState.addNote(messageText);
      } else {
        await chatState.sendMessage(messageText);
      }
      messageText = "";
    } catch (e: any) {
      errorMessage = e.message || "Error";
      if (errorTimeout) clearTimeout(errorTimeout);
      errorTimeout = setTimeout(() => (errorMessage = ""), 3000);
    } finally {
      isSending = false;
      if (inputEl) inputEl.focus();
    }
  }

  // Cleanup effect
  $effect(() => {
    return () => {
      if (errorTimeout) clearTimeout(errorTimeout);
    };
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Auto-resize on keydown is handled by bind:value and effect or input event
    // But we adding it here just in case ensures responsiveness
    if (e.target instanceof HTMLTextAreaElement) {
      setTimeout(
        () => adjustTextareaHeight(e.target as HTMLTextAreaElement),
        0,
      );
    }
  }

  function toggle() {
    isOpen = !isOpen;
  }

  function getPanelTitle(mode: string) {
    if (mode === "chat") return "Global Chat";
    if (mode === "notes") return "My Notes";
    if (mode === "ai") return "AI Assistant";
    return "Side Panel";
  }

  function cleanStreamingContent(text: string): string {
    // Hide JSON blocks that likely contain actions, even while streaming
    // This looks for the start of a json block and hides everything until it sees a closing block or just stops
    return text
      .replace(/```json\s*[\s\S]*?("action"|$)[\s\S]*?(?:```|$)/g, "")
      .trim();
  }

  function renderMarkdown(text: string): string {
    try {
      const cleaned = cleanStreamingContent(text);
      const raw = marked.parse(cleaned) as string;
      if (typeof window !== "undefined") {
        return DOMPurify.sanitize(raw);
      }
      return ""; // SSR safe fallback
    } catch (e) {
      console.error("Markdown rendering error:", e);
      return text;
    }
  }

  // Reactive layout variables
  let layout = $derived(settingsState.sidePanelLayout || "floating");
  let isFloating = $derived(layout === "floating");
  let isSidebar = $derived(!isFloating); // Standard

  let styleMode = $derived(settingsState.chatStyle || "minimal"); // minimal, bubble, terminal

  let isTerminal = $derived(styleMode === "terminal");
  let isBubble = $derived(styleMode === "bubble");
  let isMinimal = $derived(styleMode === "minimal");
  let isAiMode = $derived(settingsState.sidePanelMode === "ai");
  let contextData = $derived(aiState.lastContext);

  function adjustTextareaHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  $effect(() => {
    if (inputEl && messageText === "") {
      inputEl.style.height = "auto";
    }
  });

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

  function changeFontSize(delta: number) {
    settingsState.chatFontSize = Math.max(
      8,
      Math.min(24, (settingsState.chatFontSize || 13) + delta),
    );
  }

  function copyToClipboard(text: string) {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(text);
      // Optional: add a toast or similar feedback here if available
    }
  }

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

  function toggleLayout() {
    settingsState.sidePanelLayout =
      settingsState.sidePanelLayout === "floating" ? "standard" : "floating";
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
    <!-- Console and Floating use same FAB style trigger, Sidebar uses Strip -->
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
                ><path
                  d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
                /><path
                  d="M12 16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"
                /><path
                  d="M2 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
                /><path
                  d="M16 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"
                /><circle cx="12" cy="12" r="3" /></svg
              >
            {:else}
              {@html icons.messageSquare}
            {/if}
          </div>
          <div
            class="writing-vertical-lr text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-2 transform rotate-180"
          >
            {settingsState.sidePanelMode}
          </div>
        </div>
      {:else}
        <!-- Floating / Console Widget Button -->
        <!-- Hide button if Console is Open? Maybe yes for cleaner look, or keep as toggle -->
        {#if !isOpen}
          <div
            in:scale={{ duration: 200 }}
            class="w-12 h-12 rounded-full border shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
            class:bg-black={isTerminal}
            class:border-green-500={isTerminal}
            class:text-green-500={isTerminal}
            class:bg-[var(--bg-tertiary)]={!isTerminal}
            class:text-[var(--text-primary)]={!isTerminal}
            class:border-[var(--border-color)]={!isTerminal}
            class:hover:bg-[var(--bg-secondary)]={!isTerminal}
          >
            {#if settingsState.sidePanelMode === "ai"}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path
                  d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
                /><path
                  d="M12 16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"
                /><path
                  d="M2 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
                /><path
                  d="M16 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"
                /><circle cx="12" cy="12" r="3" /></svg
              >
            {:else}
              {@html icons.messageSquare}
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    <!-- MAIN PANEL CONTENT -->
    {#if isOpen}
      <div
        bind:this={panelEl}
        onmousedown={bringToFront}
        role="region"
        aria-label="Side Panel"
        class="flex flex-col pointer-events-auto shadow-2xl overflow-hidden fixed glass-panel panel-border"
        class:is-interacting={isInteracting}
        transition:fly={{
          y: isFloating ? 20 : 0,
          x: isSidebar ? -30 : 0,
          duration: 250,
        }}
        style="{settingsState.panelIsExpanded
          ? 'width: 100vw; height: 100vh; left: 0; top: 0; border-radius: 0;'
          : isSidebar
            ? `width: ${settingsState.panelState?.width || 320}px;`
            : settingsState.panelState
              ? `width: ${settingsState.panelState.width}px; height: ${settingsState.panelState.height}px; left: ${settingsState.panelState.x}px; top: ${settingsState.panelState.y}px;`
              : ''} min-width: 300px; min-height: 200px; touch-action: none; z-index: {currentZIndex};"
        class:rounded-lg={isFloating && !settingsState.panelIsExpanded}
        class:w-80={isSidebar}
        class:h-full={isSidebar}
        class:left-0={isSidebar}
        class:top-0={isSidebar}
        class:bg-[var(--bg-secondary)]={isTerminal}
        class:border-green-800={isTerminal}
        class:text-green-500={isTerminal}
        class:font-mono={isTerminal}
        class:bg-[var(--bg-tertiary)]={!isTerminal}
      >
        <!-- Main Panel Content -->
        <div class="flex-1 flex flex-col min-h-0">
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="panel-header h-10 border-b flex items-center px-4 shrink-0 transition-colors bg-[var(--bg-secondary)]"
            class:border-green-900={isTerminal}
            class:border-[var(--border-color)]={!isTerminal}
            role="toolbar"
            tabindex="0"
          >
            <h3
              class="font-bold text-xs tracking-widest uppercase"
              class:text-green-500={isTerminal}
              class:text-[var(--text-primary)]={!isTerminal}
            >
              <button
                type="button"
                class="hover:text-[var(--accent-color)] transition-colors cursor-pointer bg-transparent border-none p-0"
                style="font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit;"
                onclick={cycleMode}
                ondblclick={(e) => e.stopPropagation()}
              >
                {getPanelTitle(settingsState.sidePanelMode)}
              </button>
            </h3>

            <!-- Drag Handle Spacer -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- Drag Handle Spacer -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="drag-handle flex-1 mx-2 my-1 self-stretch rounded bg-transparent transition-colors"
              class:cursor-move={!isSidebar}
              ondblclick={() => toggleLayout()}
            ></div>

            <div class="flex items-center gap-2">
              <!-- Font Size Controls -->
              <div
                class="flex items-center gap-1 mr-2 border-r border-[var(--border-color)] pr-2"
                class:border-green-900={isTerminal}
              >
                <button
                  class="hover:text-[var(--text-primary)] transition-colors p-0.5"
                  onclick={() => changeFontSize(-1)}
                  ondblclick={(e) => e.stopPropagation()}
                  title="Smaller Font"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    ><line x1="5" y1="12" x2="19" y2="12" /></svg
                  >
                </button>
                <span class="text-[9px] font-mono opacity-50 w-4 text-center"
                  >{settingsState.chatFontSize || 13}</span
                >
                <button
                  class="hover:text-[var(--text-primary)] transition-colors p-0.5"
                  onclick={() => changeFontSize(+1)}
                  ondblclick={(e) => e.stopPropagation()}
                  title="Larger Font"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-3 w-3"
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
                title="Export Chat"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><path
                    d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"
                  /><polyline points="7 10 12 15 17 10" /><line
                    x1="12"
                    y1="15"
                    x2="12"
                    y2="3"
                  /></svg
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
                  ? "Collapse Panel"
                  : "Expand Panel"}
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
                  const confirmClear = settingsState.aiConfirmClear; // We reuse this setting for simplicity or add a general one

                  const clearFn = () => {
                    if (mode === "ai") aiState.clearHistory();
                    else if (mode === "notes") notesState.clearNotes();
                    else chatState.clearHistory();
                  };

                  if (confirmClear) {
                    if (
                      confirm(
                        $_(
                          mode === "notes"
                            ? "notes.clearConfirm"
                            : "chat.clearConfirm" as any,
                        ) || "Clear history?",
                      )
                    ) {
                      clearFn();
                    }
                  } else {
                    clearFn();
                  }
                  inputEl?.focus();
                }}
                ondblclick={(e) => e.stopPropagation()}
                title="Clear History"
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
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  /></svg
                >
              </button>
              <button
                class="transition-colors p-0.5"
                class:text-green-500={isTerminal}
                class:text-[var(--text-secondary)]={!isTerminal}
                class:hover:text-[var(--text-primary)]={!isTerminal}
                class:hover:text-green-300={isTerminal}
                aria-label="Close"
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

          <!-- Messages Area -->
          <div
            bind:this={messagesContainer}
            class="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-3 scroll-smooth"
            class:bg-black={isTerminal}
            class:bg-[var(--chat-messages-bg)]={!isTerminal}
          >
            {#if settingsState.sidePanelMode === "ai"}
              <!-- AI Messages -->
              {#each aiState.messages as msg (msg.id)}
                {@const isActionMsg =
                  msg.role === "system" &&
                  (msg.content.includes("[PENDING:") ||
                    msg.content.includes("[✅") ||
                    msg.content.includes("[❌"))}
                <div
                  class="flex flex-col text-sm {msg.role === 'user'
                    ? 'items-end'
                    : 'items-start'} {isActionMsg ? 'my-1' : ''}"
                >
                  <!-- Label for Terminal / Minimal Mode -->
                  {#if !isBubble && !isActionMsg}
                    <div
                      class="mb-1 text-[10px] uppercase font-bold tracking-wider opacity-60"
                    >
                      {msg.role === "user" ? "You" : "AI"}
                    </div>
                  {/if}

                  <div
                    class="leading-relaxed transition-all relative group"
                    style="font-size: {settingsState.chatFontSize || 13}px"
                    class:text-green-400={isTerminal && msg.role === "user"}
                    class:text-green-600={isTerminal &&
                      msg.role === "assistant"}
                    class:w-full={isTerminal}
                    class:text-right={isTerminal && msg.role === "user"}
                    class:text-[var(--accent-color)]={isMinimal &&
                      msg.role === "user"}
                    class:text-[var(--text-primary)]={isMinimal &&
                      msg.role === "assistant"}
                    class:max-w-[90%]={isMinimal && msg.role === "user"}
                    class:max-w-[95%]={isMinimal && msg.role === "assistant"}
                    class:text-left={isMinimal && msg.role === "assistant"}
                    class:bg-gradient-to-br={isBubble && msg.role === "user"}
                    class:from-indigo-600={isBubble && msg.role === "user"}
                    class:to-blue-600={isBubble && msg.role === "user"}
                    class:text-white={isBubble && msg.role === "user"}
                    class:rounded-[1.2rem]={isBubble && !isActionMsg}
                    class:rounded-tr-none={isBubble && msg.role === "user"}
                    class:px-4={isBubble && !isActionMsg}
                    class:py-2={isBubble && !isActionMsg}
                    class:shadow-md={isBubble && msg.role === "user"}
                    class:max-w-[85%]={isBubble}
                    class:bg-[var(--chat-bubble-bg)]={isBubble &&
                      msg.role === "assistant" &&
                      !isActionMsg}
                    class:rounded-tl-none={isBubble && msg.role === "assistant"}
                    class:border={isBubble &&
                      msg.role === "assistant" &&
                      !isActionMsg}
                    class:border-[var(--border-color)]={isBubble &&
                      msg.role === "assistant" &&
                      !isActionMsg}
                    class:shadow-sm={isBubble &&
                      msg.role === "assistant" &&
                      !isActionMsg}
                    class:overflow-x-hidden={isBubble}
                  >
                    <!-- Copy Button (shows on hover) -->
                    <button
                      class="absolute -top-2 {msg.role === 'user'
                        ? '-left-6'
                        : '-right-6'} p-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-[var(--accent-color)]"
                      onclick={() => copyToClipboard(msg.content)}
                      title="Copy Content"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        ><rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        /><path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        /></svg
                      >
                    </button>

                    {#if msg.role === "assistant"}
                      <div
                        class="markdown-content"
                        style="font-size: inherit"
                        class:terminal-md={isTerminal}
                      >
                        {@html renderMarkdown(msg.content)}
                      </div>
                    {:else if msg.role === "system"}
                      {@const pendingMatch =
                        msg.content.match(/\[PENDING:([^\]]+)\]/)}
                      {#if pendingMatch}
                        {@const pendingId = pendingMatch[1]}
                        {@const pending = aiState.pendingActions.get(pendingId)}
                        {#if pending}
                          <div class="action-confirmation-block">
                            <div class="action-table-container">
                              <table class="action-mini-table">
                                <thead>
                                  <tr>
                                    <th colspan="2"
                                      >Vorgeschlagene Änderungen</th
                                    >
                                  </tr>
                                </thead>
                                <tbody>
                                  {#each pending.actions as action}
                                    <tr>
                                      <td class="action-label"
                                        >{aiState
                                          .describeAction(action)
                                          .split(": ")[0]}</td
                                      >
                                      <td class="action-value"
                                        >{aiState
                                          .describeAction(action)
                                          .split(": ")[1] || ""}</td
                                      >
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                            </div>
                            <div class="flex gap-2 mt-2">
                              <button
                                class="confirm-btn"
                                onclick={() => aiState.confirmAction(pendingId)}
                              >
                                Anwenden
                              </button>
                              <button
                                class="reject-btn"
                                onclick={() => aiState.rejectAction(pendingId)}
                              >
                                Ignorieren
                              </button>
                            </div>
                          </div>
                        {/if}
                      {:else if msg.content.includes("[✅") || msg.content.includes("[❌")}
                        <div class="text-[0.7rem] opacity-50 italic">
                          {msg.content.replace(/\[|\]/g, "")}
                        </div>
                      {:else}
                        <div class="text-[0.75rem] opacity-60">
                          {msg.content}
                        </div>
                      {/if}
                    {:else}
                      {msg.content}
                    {/if}
                  </div>

                  {#if isBubble}
                    <span
                      class="text-[9px] text-[var(--text-tertiary)] mt-1 px-1 opacity-70"
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  {:else}
                    <div class="text-[9px] mt-1 opacity-50 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  {/if}
                </div>
              {/each}

              {#if aiState.isStreaming}
                <div class="flex flex-col items-start animate-pulse">
                  {#if isTerminal}
                    <span class="text-xs text-green-500 blink"
                      >_ PROCESSING...</span
                    >
                  {:else}
                    <span
                      class="text-[10px] uppercase font-bold text-[var(--accent-color)]"
                      >Thinking...</span
                    >
                  {/if}
                </div>
              {/if}

              {#if aiState.messages.length === 0}
                <div
                  class="flex flex-col items-center justify-center h-full opacity-40 select-none"
                >
                  {#if isTerminal}
                    <p class="text-xs text-green-800">
                      SYSTEM READY. AWAITING INPUT.
                    </p>
                  {:else}
                    <p class="text-xs font-medium text-[var(--text-secondary)]">
                      Ready to assist.
                    </p>
                  {/if}
                </div>
              {/if}
            {:else if settingsState.sidePanelMode === "notes"}
              <!-- Private Notes -->
              {#each notesState.messages as msg (msg.id)}
                <div
                  class="mb-3 p-3 bg-[var(--bg-tertiary)] rounded border border-[var(--border-color)] relative group"
                >
                  <div
                    class="whitespace-pre-wrap text-[var(--text-primary)] font-medium"
                    style="font-size: {settingsState.chatFontSize || 13}px"
                  >
                    {msg.text}
                  </div>
                  <div
                    class="text-[10px] text-[var(--text-secondary)] mt-2 text-right"
                  >
                    {new Date(msg.timestamp).toLocaleString()}
                  </div>
                </div>
              {/each}
            {:else}
              <!-- Global Chat -->
              <div
                class="text-[10px] text-center opacity-40 mb-4 uppercase tracking-widest font-bold"
              >
                --- Connected to Global Chat ---
              </div>
              {#each chatState.messages.filter((m) => {
                if (m.sender === "system") return true;
                if (m.clientId === chatState.clientId) return true;
                if (m.profitFactor === undefined) return true;
                return m.profitFactor >= (settingsState.minChatProfitFactor || 0);
              }) as msg (msg.id)}
                <div
                  class="mb-3 text-[var(--text-primary)] pl-2 border-l-2 border-[var(--accent-color)] bg-[var(--bg-tertiary)]/30 rounded-r p-1"
                >
                  {#if msg.sender === "system"}
                    <div
                      class="text-xs text-[var(--accent-color)] font-bold mb-1 opacity-80 text-center uppercase tracking-wider"
                    >
                      --- {msg.text} ---
                    </div>
                  {:else}
                    {@const isMe =
                      msg.clientId === chatState.clientId ||
                      msg.senderId === "me"}
                    <div class="flex flex-col">
                      <span
                        class="text-[9px] font-bold opacity-60 uppercase mb-0.5 flex items-center gap-1.5"
                        class:text-[var(--accent-color)]={isMe}
                        class:opacity-100={isMe}
                      >
                        <span>
                          {isMe ? "You" : "User"}
                        </span>
                        {#if msg.profitFactor !== undefined}
                          <span
                            class="px-1.5 py-0.5 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded text-[7px] font-black shadow-sm"
                            style="line-height: 1;"
                          >
                            PF {msg.profitFactor.toFixed(2)}
                          </span>
                        {/if}
                      </span>
                      <span
                        class="leading-tight text-[var(--text-primary)]"
                        style="font-size: {settingsState.chatFontSize || 13}px"
                        >{msg.text}</span
                      >
                      <span class="text-[9px] opacity-30 mt-1 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  {/if}
                </div>
              {/each}
            {/if}
          </div>

          <!-- Input Area -->
          <div
            class="p-2 border-t shrink-0 transition-colors bg-[var(--bg-secondary)]"
            class:border-green-900={isTerminal}
            class:border-[var(--border-color)]={!isTerminal}
          >
            <!-- Context Status Bar (Phase 1) -->
            {#if isAiMode}
              <div
                class="flex items-center gap-3 px-1 mb-2 text-[10px] opacity-60 overflow-hidden"
              >
                <div
                  class="flex items-center gap-1"
                  title="Market Data Available"
                  class:text-green-500={contextData?.cmc?.global ||
                    contextData?.technicals}
                >
                  <span>{contextData?.cmc?.global ? "🟢" : "⚪"}</span> Market
                </div>
                <div
                  class="flex items-center gap-1"
                  title="News Data Available"
                  class:text-green-500={contextData?.news &&
                    contextData.news.length > 0}
                >
                  <span
                    >{contextData?.news && contextData.news.length > 0
                      ? "🟢"
                      : "⚪"}</span
                  > News
                </div>
                <!-- Add more indicators as needed -->
              </div>

              <!-- Quick Actions (Phase 1) -->
              {#if !messageText}
                <div class="flex gap-2 overflow-x-auto mb-2 pb-1 no-scrollbar">
                  <button
                    class="text-xs border border-[var(--border-color)] rounded-full px-3 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] whitespace-nowrap transition-colors"
                    onclick={() => {
                      messageText =
                        "Analysiere den Markt für " +
                        (tradeState.symbol || "BTC");
                      handleSend();
                    }}
                  >
                    📊 Market Check
                  </button>
                  <button
                    class="text-xs border border-[var(--border-color)] rounded-full px-3 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] whitespace-nowrap transition-colors"
                    onclick={() => {
                      messageText =
                        "Erstelle eine technische Analyse für " +
                        (tradeState.symbol || "BTC");
                      handleSend();
                    }}
                  >
                    🧪 Tech Analysis
                  </button>
                  <button
                    class="text-xs border border-[var(--border-color)] rounded-full px-3 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] whitespace-nowrap transition-colors"
                    onclick={() => {
                      messageText = "Prüfe mein Setup auf Fehler und Risiken.";
                      handleSend();
                    }}
                  >
                    ⚠️ Risk Audit
                  </button>
                  <button
                    class="text-xs border border-[var(--border-color)] rounded-full px-3 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] whitespace-nowrap transition-colors"
                    onclick={() => {
                      messageText = "Gibt es wichtige News?";
                      handleSend();
                    }}
                  >
                    📰 News check
                  </button>
                </div>
              {/if}
            {/if}

            {#if errorMessage}
              {@const isRateLimit =
                errorMessage.toLowerCase().includes("quota") ||
                errorMessage.includes("429")}
              <div
                class="text-xs mb-2 px-2 transition-colors"
                class:text-[var(--danger-color)]={!isRateLimit}
                class:animate-pulse={!isRateLimit}
                class:text-orange-400={isRateLimit}
                class:font-medium={isRateLimit}
              >
                {#if isRateLimit}
                  <div class="flex items-center gap-1.5 opacity-90">
                    <span>⚠️</span>
                    <span
                      >Generative AI Quota exceeded. Please try again later or
                      check API settings.</span
                    >
                  </div>
                {:else}
                  {$_(errorMessage as any) || errorMessage || aiState.error}
                {/if}
              </div>
            {/if}
            <div class="relative w-full">
              {#if isAiMode || settingsState.sidePanelMode === "notes"}
                <textarea
                  bind:this={inputEl}
                  rows="1"
                  class="w-full bg-transparent border-none focus:ring-0 p-2 pr-10 resize-none flex items-center min-h-[40px] max-h-[200px]"
                  style="font-size: {settingsState.chatFontSize || 13}px"
                  class:bg-black={isTerminal}
                  class:text-green-500={isTerminal}
                  class:border-green-800={isTerminal}
                  class:focus:border-green-500={isTerminal}
                  class:font-mono={isTerminal}
                  class:bg-[var(--bg-primary)]={!isTerminal}
                  class:text-[var(--text-primary)]={!isTerminal}
                  class:border-[var(--border-color)]={!isTerminal}
                  class:rounded-xl={!isTerminal}
                  class:focus:border-[var(--accent-color)]={!isTerminal}
                  class:placeholder-[var(--text-tertiary)]={true}
                  placeholder={settingsState.sidePanelMode === "ai"
                    ? isTerminal
                      ? "> ENTER COMMAND"
                      : "Message AI... (Shift+Enter for new line)"
                    : "Type note..."}
                  maxlength={settingsState.sidePanelMode === "ai" ? 2000 : 2000}
                  bind:value={messageText}
                  onkeydown={handleKeydown}
                  oninput={(e) =>
                    adjustTextareaHeight(e.target as HTMLTextAreaElement)}
                  disabled={isSending ||
                    (settingsState.sidePanelMode === "ai" &&
                      aiState.isStreaming)}
                ></textarea>
              {:else}
                <input
                  bind:this={inputEl}
                  type="text"
                  class="w-full bg-transparent border-none focus:ring-0 p-2 pr-10 resize-none h-10 flex items-center"
                  style="font-size: {settingsState.chatFontSize || 13}px"
                  class:bg-black={isTerminal}
                  class:text-green-500={isTerminal}
                  class:border-green-800={isTerminal}
                  class:focus:border-green-500={isTerminal}
                  class:font-mono={isTerminal}
                  class:bg-[var(--bg-primary)]={!isTerminal}
                  class:text-[var(--text-primary)]={!isTerminal}
                  class:border-[var(--border-color)]={!isTerminal}
                  class:rounded-full={isBubble}
                  class:focus:border-[var(--accent-color)]={!isTerminal}
                  class:placeholder-[var(--text-tertiary)]={true}
                  placeholder="Type here..."
                  maxlength={140}
                  bind:value={messageText}
                  onkeydown={handleKeydown}
                  disabled={isSending}
                />
              {/if}
              {#if !isTerminal}
                <button
                  class="absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--accent-color)] p-2"
                  onclick={handleSend}
                  disabled={!messageText.trim()}
                  aria-label="Send message"
                  title="Send message"
                >
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
                    ><line x1="22" y1="2" x2="11" y2="13"></line><polygon
                      points="22 2 15 22 11 13 2 9 22 2"
                    ></polygon></svg
                  >
                </button>
              {/if}
            </div>
          </div>
        </div>
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

  .blink {
    animation: blinker 1s linear infinite;
  }
  @keyframes blinker {
    50% {
      opacity: 0;
    }
  }

  /* Markdown Styles - Theme Aware */
  .markdown-content :global(p) {
    margin-bottom: 0.75rem;
    line-height: 1.5;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-content :global(strong) {
    font-weight: 700;
    color: inherit;
  }
  .markdown-content :global(code) {
    background: rgba(125, 125, 125, 0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    font-family: monospace;
    font-size: 0.9em;
  }
  .markdown-content :global(pre) {
    background: rgba(0, 0, 0, 0.2);
    padding: 0.75rem;
    border-radius: 0.3rem;
    border: 1px solid rgba(125, 125, 125, 0.1);
    overflow-x: auto;
    margin-bottom: 1rem;
    margin-top: 0.5rem;
  }

  /* Terminal Overrides */
  .terminal-md :global(*) {
    color: #22c55e !important; /* Tailwind green-500 */
    font-family: monospace !important;
  }

  /* Action UI */
  .action-confirmation-block {
    background: var(--bg-color-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 8px;
    max-width: 250px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .action-mini-table {
    width: 100%;
    font-size: 0.75rem;
    border-collapse: collapse;
    color: var(--text-primary);
  }

  .action-mini-table th {
    text-align: left;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border-color);
    font-weight: 600;
    opacity: 0.7;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .action-mini-table td {
    padding: 2px 0;
  }

  .action-label {
    opacity: 0.6;
    font-weight: 400;
  }

  .action-value {
    text-align: right;
    font-weight: 600;
    font-family: monospace;
    color: var(--accent-color);
  }

  .confirm-btn {
    flex: 1;
    background: var(--accent-color);
    color: white;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: filter 0.2s;
  }

  .confirm-btn:hover {
    filter: brightness(1.2);
  }

  .reject-btn {
    background: rgba(125, 125, 125, 0.1);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 400;
    cursor: pointer;
    transition: background 0.2s;
  }

  .reject-btn:hover {
    background: rgba(125, 125, 125, 0.2);
  }

  /* Panel Border */
  .panel-border {
    border: 1px solid var(--border-color);
  }

  .is-interacting.panel-border {
    border-color: var(--accent-color);
  }
</style>
