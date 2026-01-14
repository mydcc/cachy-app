<script lang="ts">
  import { locale, setLocale, _ } from "../../locales/i18n";
</script>

<div class="flex items-center justify-center gap-2">
  <button
    class="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all duration-200"
    class:border-2={$locale === "de"}
    class:border-[var(--accent-color)]={$locale === "de"}
    class:border-transparent={$locale !== "de"}
    class:opacity-50={$locale !== "de"}
    class:hover:opacity-100={$locale !== "de"}
    onclick={() => setLocale("de")}
    title={$_("languages.german")}
  >
    🇩🇪
  </button>
  <button
    class="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all duration-200"
    class:border-2={$locale === "en"}
    class:border-[var(--accent-color)]={$locale === "en"}
    class:border-transparent={$locale !== "en"}
    class:opacity-50={$locale !== "en"}
    class:hover:opacity-100={$locale !== "en"}
    onclick={() => setLocale("en")}
    title={$_("languages.english")}
  >
    🇬🇧
  </button>
</div>

<style>
  button {
    border-style: solid;
  }
</style>
