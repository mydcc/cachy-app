<script lang="ts">
  import { quizState } from "../../stores/quiz.svelte";
  import { fade, scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { _ } from "../../locales/i18n";
  import { marked } from "marked";
  import markedKatex from "marked-katex-extension";
  import "katex/dist/katex.min.css";
  import { burn } from "../../actions/burn";

  // Setup Markdown with KaTeX
  try {
    marked.use(markedKatex({ throwOnError: false }));
  } catch (e) {
    console.warn("Marked KaTeX extension might already be registered", e);
  }

  let isFlipped = $state(false);

  // Reset flip when active question changes (new card)
  $effect(() => {
    if (quizState.activeQuestion) {
      isFlipped = false;
    }
  });

  function handleFlip() {
    isFlipped = !isFlipped;
  }

  function handleKnown() {
    quizState.markKnown();
  }

  function handleUnknown() {
    quizState.markUnknown();
  }

  function renderMarkdown(text: string) {
    return marked.parse(text);
  }
</script>

{#if quizState.isQuizActive && quizState.activeQuestion}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    transition:fade={{ duration: 200 }}
    onclick={() => quizState.closeQuiz()}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === "Escape" && quizState.closeQuiz()}
  >
    <!-- Card Container -->
    <div
      class="relative w-full max-w-md aspect-[4/3] perspective-1000 cursor-pointer group"
      onclick={(e) => {
        e.stopPropagation();
        if (!isFlipped) handleFlip();
      }}
      transition:scale={{ duration: 300, easing: quintOut, start: 0.8 }}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === "Enter" && handleFlip()}
    >
      <!-- Card Inner -->
      <div
        class="relative w-full h-full duration-500 preserve-3d transition-transform {isFlipped
          ? 'rotate-y-180'
          : ''}"
      >
        <!-- Front -->
        <div
          use:burn={{ color: "#ff8800", intensity: 1.2 }}
          class="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-8 text-center bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl shadow-2xl glass-panel"
        >
          <div
            class="text-[var(--text-secondary)] text-sm uppercase tracking-widest font-bold mb-4"
          >
            {$_("quiz.question")}
          </div>
          <div
            class="text-xl md:text-2xl font-bold text-[var(--text-primary)] leading-relaxed select-none prose dark:prose-invert max-w-none"
          >
            {@html renderMarkdown(quizState.activeQuestion.question)}
          </div>
          <div
            class="absolute bottom-6 text-xs text-[var(--text-tertiary)] animate-pulse select-none"
          >
            {$_("quiz.clickToReveal")}
          </div>
        </div>

        <!-- Back -->
        <div
          use:burn={{ color: "#00ff9d", intensity: 1.2 }}
          class="absolute inset-0 backface-hidden rotate-y-180 flex flex-col items-center justify-center p-8 text-center bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl shadow-2xl glass-panel"
        >
          <div class="flex-1 flex flex-col items-center justify-center w-full">
            <div
              class="text-[var(--text-secondary)] text-sm uppercase tracking-widest font-bold mb-2"
            >
              {$_("quiz.answer")}
            </div>
            <div
              class="text-lg text-[var(--text-primary)] leading-relaxed overflow-y-auto max-h-[60%] w-full scrollbar-hide prose dark:prose-invert max-w-none"
            >
              {@html renderMarkdown(quizState.activeQuestion.answer)}
            </div>
          </div>

          <div class="flex gap-4 w-full mt-4 shrink-0">
            <button
              class="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-lg hover:shadow-red-500/20 active:scale-95 transform duration-100"
              onclick={(e) => {
                e.stopPropagation();
                handleUnknown();
              }}
            >
              {$_("quiz.repeat")}
            </button>
            <button
              class="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-green-500 hover:bg-green-600 transition-colors shadow-lg hover:shadow-green-500/20 active:scale-95 transform duration-100"
              onclick={(e) => {
                e.stopPropagation();
                handleKnown();
              }}
            >
              {$_("quiz.known")}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .perspective-1000 {
    perspective: 1000px;
  }
  .preserve-3d {
    transform-style: preserve-3d;
  }
  .backface-hidden {
    backface-visibility: hidden;
  }
  .rotate-y-180 {
    transform: rotateY(180deg);
  }
</style>
