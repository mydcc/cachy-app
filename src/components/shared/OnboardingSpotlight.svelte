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

<script lang="ts">
  import { browser } from "$app/environment";
  import { onboardingState } from "../../stores/onboarding.svelte";
  import { _ } from "../../locales/i18n";
  import type { TranslationKey } from "../../locales/schema";

  let targetRect = $state<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  let isMobile = $state(false);
  let cardEl: HTMLElement | null = $state(null);

  // Set while a smooth scrollIntoView triggered by us is still running; scroll
  // events in that window are ignored so the animation cannot fight itself.
  let scrollSettlesAt = 0;

  /**
   * First candidate that exists AND is rendered (non-zero rect). A hidden
   * responsive variant must never win just because it appears first in DOM
   * order — that is what degenerate zero-size spotlights are made of.
   */
  function resolveVisibleElement(selectors: string[]): HTMLElement | null {
    for (const selector of selectors) {
      const candidates = document.querySelectorAll<HTMLElement>(selector);
      for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return candidate;
      }
    }
    return null;
  }

  function updateTargetPosition() {
    if (!browser || !onboardingState.isActive || !onboardingState.activeStep) {
      targetRect = null;
      return;
    }

    isMobile = window.innerWidth < 768;
    const element = resolveVisibleElement(
      onboardingState.activeStep.targetSelectors,
    );

    if (!element) {
      targetRect = null;
      return;
    }

    // Scroll target into view if off-screen, then wait for the smooth scroll
    // to settle before capturing the final rect.
    const rect = element.getBoundingClientRect();
    const isOffScreen =
      rect.top < 0 ||
      rect.bottom > window.innerHeight ||
      rect.left < 0 ||
      rect.right > window.innerWidth;

    if (isOffScreen && Date.now() >= scrollSettlesAt) {
      element.scrollIntoView({
        behavior: "smooth",
        block: isMobile ? "start" : "center",
        inline: "nearest",
      });
      scrollSettlesAt = Date.now() + 700;
      return;
    }

    captureRect(element);
  }

  function captureRect(element: HTMLElement) {
    const updated = element.getBoundingClientRect();
    const pad = 6;
    // Clamp on all four sides: the pad may never push the cutout past the
    // viewport edge, and an element hanging off-screen must not produce a
    // box wider than the screen.
    const overRight = Math.max(0, updated.right + pad - window.innerWidth);
    const overBottom = Math.max(0, updated.bottom + pad - window.innerHeight);
    const top = Math.max(0, updated.top - pad);
    const left = Math.max(0, updated.left - pad);
    targetRect = {
      top,
      left,
      width: Math.max(0, updated.width + pad * 2 - overRight),
      height: Math.max(0, updated.height + pad * 2 - overBottom),
    };
  }

  $effect(() => {
    if (onboardingState.isActive) {
      // Small timeout to allow any window transition to settle
      const timer = setTimeout(updateTargetPosition, 50);
      return () => clearTimeout(timer);
    }
  });

  // Recompute position on step changes
  $effect(() => {
    if (onboardingState.isActive && onboardingState.currentStep !== undefined) {
      scrollSettlesAt = 0;
      updateTargetPosition();
    }
  });

  function isInteractiveTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      target.closest("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])") !== null
    );
  }

  // Global listeners for resize, scroll and keyboard incl. focus trap
  $effect(() => {
    if (!browser || !onboardingState.isActive) return;

    const trapTab = (e: KeyboardEvent) => {
      if (!cardEl) return;
      const focusables = cardEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (!cardEl.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onboardingState.skip();
      } else if (e.key === "Tab") {
        trapTab(e);
      } else if (
        (e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowLeft") &&
        !isInteractiveTarget(e.target)
      ) {
        // Never swallow Enter on a focused button — its default action IS the
        // click; hijacking it made Skip behave like Next.
        e.preventDefault();
        if (e.key === "ArrowLeft") onboardingState.prev();
        else onboardingState.next();
      }
    };

    const handleResize = () => {
      scrollSettlesAt = 0;
      updateTargetPosition();
    };

    const handleScroll = () => {
      if (Date.now() < scrollSettlesAt) return; // smooth scroll still running
      if (onboardingState.activeStep) {
        const element = resolveVisibleElement(
          onboardingState.activeStep.targetSelectors,
        );
        if (element) captureRect(element);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
    };
  });

  // Move focus into the dialog while open, restore it when the tour ends.
  let previouslyFocused: HTMLElement | null = null;
  $effect(() => {
    if (!browser || !onboardingState.isActive) return;
    previouslyFocused = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => {
      const focusable = cardEl?.querySelector<HTMLElement>("button");
      (focusable ?? cardEl)?.focus();
    }, 80);
    return () => {
      clearTimeout(timer);
      previouslyFocused?.focus?.();
    };
  });

  // Derived placement style for the desktop floating card.
  let cardStyle = $derived.by(() => {
    if (!browser || isMobile) return ""; // mobile uses the bottom sheet classes

    if (!targetRect) {
      // No visible target: center the card on screen. Inline style instead of
      // Tailwind fractions so this can never break via class-name parsing.
      return [
        "position: fixed;",
        "top: 50%;",
        "left: 50%;",
        "transform: translate(-50%, -50%);",
        "width: min(24rem, calc(100vw - 2rem));",
      ].join(" ");
    }

    const cardWidth = 380;
    const pad = 16;
    // Measure the real card; before the first layout pass fall back generously.
    const cardHeight = cardEl?.offsetHeight || 240;

    const belowTop = targetRect.top + targetRect.height + pad;
    const aboveTop = targetRect.top - cardHeight - pad;
    const fitsBelow = belowTop + cardHeight <= window.innerHeight;
    const fitsAbove = aboveTop >= 0;
    const placement = onboardingState.activeStep?.preferredPlacement ?? "auto";

    let top: number;
    if (placement === "top") {
      top = fitsAbove ? aboveTop : belowTop;
    } else {
      // Default / auto: prefer bottom, flip only if it would overflow.
      top = belowTop;
      if (!fitsBelow && fitsAbove) top = aboveTop;
    }

    // Horizontally center with target, clamped within viewport
    let left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - cardWidth - pad));

    return `top: ${top}px; left: ${left}px; width: ${cardWidth}px; position: fixed;`;
  });
</script>

{#if onboardingState.isActive && onboardingState.activeStep}
  <!-- Dark Backdrop with Pointer Interception -->
  <div
    class="fixed inset-0 z-[var(--z-modal)] pointer-events-auto overflow-hidden transition-opacity duration-300"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) {
        onboardingState.skip();
      }
    }}
  >
    <!-- Spotlight Cutout Highlight Box -->
    {#if targetRect}
      <div
        class="fixed rounded-xl pointer-events-none transition-all duration-300 ease-out"
        style="
          top: {targetRect.top}px;
          left: {targetRect.left}px;
          width: {targetRect.width}px;
          height: {targetRect.height}px;
          box-shadow: 0 0 0 9999px var(--scrim);
          border: 2px solid var(--accent);
        "
      ></div>
    {:else}
      <!-- Fullscreen Dim Fallback if no target element is visible -->
      <div
        class="fixed inset-0 pointer-events-none transition-opacity duration-300"
        style="background: var(--scrim);"
      ></div>
    {/if}

    <!-- Onboarding Step Card -->
    <div
      bind:this={cardEl}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-desc"
      tabindex="-1"
      class="glass-panel z-10 bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] shadow-2xl rounded-2xl p-5 flex flex-col gap-4 onboard-card-in outline-none"
      class:fixed={isMobile}
      class:bottom-4={isMobile}
      class:inset-x-4={isMobile}
      style={cardStyle}
    >
      <!-- Card Header -->
      <div class="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div class="flex items-center gap-2">
          <span class="text-base select-none">🦆</span>
          <span class="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            {$_("onboarding.badge" as TranslationKey)}
          </span>
          <span class="text-xs font-medium text-[var(--text-secondary)]">
            ({onboardingState.currentStep + 1}/{onboardingState.totalSteps})
          </span>
        </div>

        <button
          type="button"
          class="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-1 px-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
          onclick={() => onboardingState.skip()}
          aria-label={$_("onboarding.skipAria" as TranslationKey)}
        >
          {$_("onboarding.skip" as TranslationKey)} <span class="hidden sm:inline opacity-60">(ESC)</span>
        </button>
      </div>

      <!-- Card Content -->
      <div class="flex flex-col gap-1.5">
        <h2 id="onboarding-title" class="text-base font-bold text-[var(--text-primary)]">
          {$_(onboardingState.activeStep.titleKey)}
        </h2>
        <p id="onboarding-desc" class="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
          {$_(onboardingState.activeStep.descKey)}
        </p>
      </div>

      <!-- Card Footer: Dots + Controls -->
      <div class="flex items-center justify-between gap-3 pt-2 mt-auto">
        <!-- Step Progress Dots -->
        <div class="flex items-center gap-1.5" aria-hidden="true">
          {#each onboardingState.steps as _, idx}
            <div
              class="h-1.5 rounded-full transition-all duration-200"
              class:w-5={idx === onboardingState.currentStep}
              class:w-1.5={idx !== onboardingState.currentStep}
              class:bg-[var(--accent)]={idx === onboardingState.currentStep}
              class:bg-[var(--border-subtle)]={idx !== onboardingState.currentStep}
            ></div>
          {/each}
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-2">
          {#if !onboardingState.isFirstStep}
            <button
              type="button"
              class="text-xs font-medium px-3 py-2 rounded-lg bg-[var(--btn-default-bg)] text-[var(--btn-default-text)] hover:bg-[var(--btn-default-hover-bg)] transition-colors"
              onclick={() => onboardingState.prev()}
            >
              {$_("onboarding.back" as TranslationKey)}
            </button>
          {/if}

          <button
            type="button"
            class="text-xs font-bold px-4 py-2 rounded-lg bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] hover:bg-[var(--btn-accent-hover-bg)] shadow-md transition-all"
            onclick={() => onboardingState.next()}
          >
            {#if onboardingState.isLastStep}
              {$_("onboarding.finish" as TranslationKey)}
            {:else}
              {$_("onboarding.next" as TranslationKey)}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Native fade-in — replaces the tailwindcss-animate plugin classes that were
     silently doing nothing (no plugin installed). Opacity-only so it never
     fights the inline transform used by the centered fallback. */
  .onboard-card-in {
    animation: onboard-card-in 180ms ease-out;
  }

  @keyframes onboard-card-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
