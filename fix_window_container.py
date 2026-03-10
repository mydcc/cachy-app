import re

with open("src/components/shared/windows/WindowContainer.svelte", "r") as f:
    content = f.read()

search = """    let minimizedWindows = $derived(
        windowManager.windows.filter((w) => w.isMinimized),
    );"""

replace = """    let minimizedWindows = $derived(
        windowManager.windows.filter((w) => w.isMinimized && w.canMinimizeToPanel),
    );"""

content = content.replace(search, replace)

with open("src/components/shared/windows/WindowContainer.svelte", "w") as f:
    f.write(content)
