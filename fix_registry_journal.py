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

with open("src/lib/windows/WindowRegistry.svelte.ts", "r") as f:
    content = f.read()

search = """                showHeaderIndicators: true,
                allowFeedDuck: false,
                canMinimizeToPanel: true // Ensure it minimizes to the sidebar dock if applicable
            },
            layout: {"""

replace = """                showHeaderIndicators: true,
                allowFeedDuck: false,
                canMinimizeToPanel: false // Minimize to LeftControlPanel instead of top dock
            },
            layout: {"""

content = content.replace(search, replace)

with open("src/lib/windows/WindowRegistry.svelte.ts", "w") as f:
    f.write(content)
