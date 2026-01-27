<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
  import { settingsState } from "../../stores/settings.svelte";
  import BackgroundAnimations from "./BackgroundAnimations.svelte";
  import ThreeBackground from "./ThreeBackground.svelte";

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
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!videoEl) return;
        if (entry.isIntersecting) {
          videoEl.play().catch(() => {});
        } else {
          videoEl.pause();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(videoEl);
    return () => {
      if (videoEl) observer.unobserve(videoEl);
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
        alt="Background"
        loading="lazy"
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
        preload="metadata"
        onerror={() => (videoError = true)}
      ></video>
    {:else if settingsState.backgroundType === "animation"}
      <BackgroundAnimations />
    {:else if settingsState.backgroundType === "threejs"}
      <div class="three-container">
        <ThreeBackground />
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
    filter: blur(var(--bg-blur, 0px)) opacity(var(--bg-opacity, 1));
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
