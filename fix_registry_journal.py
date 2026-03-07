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
