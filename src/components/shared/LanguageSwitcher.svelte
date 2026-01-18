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
