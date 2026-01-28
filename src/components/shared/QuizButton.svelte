<script lang="ts">
  import { quizState } from "../../stores/quiz.svelte";
  import { trackClick } from "../../lib/actions";
</script>

<button
  class="btn-icon-accent"
  class:active={quizState.isQuizActive}
  onclick={() => quizState.startQuiz()}
  use:trackClick={{
    category: "Quiz",
    action: "Click",
    name: "StartQuiz",
  }}
  aria-label="Start Quiz"
  title="Quick Quiz"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="2"
    class="w-5 h-5"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
</button>

<style>
  .btn-icon-accent {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 0.5rem;
    transition: all 0.2s;
    color: var(--text-secondary);
  }
  .btn-icon-accent:hover {
    color: var(--text-primary);
    background-color: var(--bg-tertiary);
  }
  .btn-icon-accent.active {
    color: var(--accent-color);
    background: rgba(var(--accent-color-rgb), 0.1);
  }
</style>
