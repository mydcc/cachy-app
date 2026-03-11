# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import re

with open("src/components/shared/LeftControlPanel.svelte", "r") as f:
    content = f.read()

# I need to import windowManager at the top
search_import = """  import { trackClick } from "../../lib/actions";"""
replace_import = """  import { trackClick } from "../../lib/actions";
  import { windowManager } from "../../lib/windows/WindowManager.svelte";"""

content = content.replace(search_import, replace_import)

# I need to add a reactive block for finding the journal window
search_derived = """  // Additional Icons not in constants (or defined locally for specificity)"""
replace_derived = """  // Reactive state for finding a minimized Journal
  let journalWindow = $derived(
    windowManager.windows.find(
      (w) => w.windowType === "journal" && w.isMinimized
    )
  );

  // Additional Icons not in constants (or defined locally for specificity)"""

content = content.replace(search_derived, replace_derived)

# Now I need to add the icon for Journal right after the assistant button
search_assistant_button = """  </button>

  <div class="h-px w-full bg-[var(--border-color)] my-1"></div>"""

replace_assistant_button = """  </button>

  {#if journalWindow}
    <button
      class="control-btn active"
      onclick={() => {
        windowManager.bringToFront(journalWindow.id);
        journalWindow.restore();
      }}
      title={journalWindow.title || "Trading Journal"}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    </button>
  {/if}

  <div class="h-px w-full bg-[var(--border-color)] my-1"></div>"""

content = content.replace(search_assistant_button, replace_assistant_button)

with open("src/components/shared/LeftControlPanel.svelte", "w") as f:
    f.write(content)
