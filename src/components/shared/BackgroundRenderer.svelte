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
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import type { Component } from "svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import BackgroundAnimations from "./BackgroundAnimations.svelte";

  let ThreeComp = $state<Component | null>(null);
  let TradeFlowComp = $state<Component | null>(null);

  $effect(() => {
    if (settingsState.backgroundType === "threejs" && !ThreeComp) {
      import("./ThreeBackground.svelte")
        .then((m) => {
          ThreeComp = m.default;
        })
        .catch((err) => {
          console.error("Failed to load ThreeBackground chunk:", err);
        });
    }
    if (settingsState.backgroundType === "tradeflow" && !TradeFlowComp) {
      import("./backgrounds/TradeFlowBackground.svelte")
        .then((m) => {
          TradeFlowComp = m.default;
        })
        .catch((err) => {
          console.error("Failed to load TradeFlowBackground chunk:", err);
        });
    }
  });

  let imageError = $state(false);
  let videoError = $state(false);
  let videoEl: HTMLVideoElement | null = $state(null);

  $effect(() => {
    if (settingsState.backgroundUrl) {
      imageError = false;
      videoError = false;
    }
  });

  $effect(() => {
    if (videoEl && settingsState.backgroundType === "video") {
      videoEl.playbackRate = settingsState.videoPlaybackSpeed;
    }
  });

  $effect(() => {
    if (!videoEl) return;
    const el = videoEl; // Capture for cleanup

    // When the video element mounts or changes, attempt to play it immediately
    el.play().catch(() => {});

    // Fallback observer
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.05 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  });

  $effect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--bg-blur",
        `${settingsState.backgroundBlur}px`,
      );
      document.documentElement.style.setProperty(
        "--bg-opacity",
        settingsState.backgroundOpacity.toString(),
      );
    }
  });
</script>

{#if settingsState.backgroundType !== "none"}
  <div class="background-container">
    {#if settingsState.backgroundType === "image" && settingsState.backgroundUrl && !imageError}
      <img
        src={settingsState.backgroundUrl}
        alt={$_("ui.background")}
        loading="eager"
        onerror={() => (imageError = true)}
      />
    {:else if settingsState.backgroundType === "video" && settingsState.backgroundUrl && !videoError}
      <video
        bind:this={videoEl}
        src={settingsState.backgroundUrl}
        autoplay
        muted
        loop
        playsinline
        crossorigin="anonymous"
        preload="auto"
        oncanplay={() => {
            if (videoEl) {
              videoEl.playbackRate = settingsState.videoPlaybackSpeed;
              videoEl.play().catch(() => {});
            }
        }}
        onerror={() => (videoError = true)}
      ></video>
    {:else if (settingsState.backgroundType === "image" || settingsState.backgroundType === "video")}
      <!-- Fallback empty state if URL is missing or errored -->
    {:else if settingsState.backgroundType === "animation"}
      <BackgroundAnimations />
    {:else if settingsState.backgroundType === "threejs"}
      <div class="three-container">
        {#if ThreeComp}
          <ThreeComp />
        {/if}
      </div>
    {:else if settingsState.backgroundType === "tradeflow"}
      <div class="three-container">
        {#if TradeFlowComp}
          <TradeFlowComp />
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .three-container {
    width: 100%;
    height: 100%;
    pointer-events: auto; /* Enable interaction for ThreeJS */
  }

  .background-container {
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    filter: blur(var(--bg-blur, 0px));
    opacity: var(--bg-opacity, 1);
    transition:
      filter 0.3s ease,
      opacity 0.3s ease;
  }

  .background-container img,
  .background-container video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
</style>
