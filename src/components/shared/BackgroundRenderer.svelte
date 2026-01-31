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
      // Force full visibility for ThreeJS to prevent "covering" by background color
      // due to default blur/opacity settings meant for images
      const isThree = settingsState.backgroundType === "threejs";
      const blur = isThree ? 0 : settingsState.backgroundBlur;
      const opacity = isThree ? 1 : settingsState.backgroundOpacity;

      document.documentElement.style.setProperty("--bg-blur", `${blur}px`);
      document.documentElement.style.setProperty(
        "--bg-opacity",
        opacity.toString(),
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
