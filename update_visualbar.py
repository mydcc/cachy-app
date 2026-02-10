import re

file_path = "src/components/shared/VisualBar.svelte"

with open(file_path, "r") as f:
    content = f.read()

# Replace SL
content = content.replace('<span class="sl-badge">SL</span>', '<span class="sl-badge">{$_("dashboard.visualBar.sl")}</span>')

# Replace TP prefix
# Pattern: <div class="tp-name">TP{tp.idx}</div>
content = re.sub(r'<div class="tp-name">TP\{tp\.idx\}</div>', '<div class="tp-name">{$_("dashboard.visualBar.tp")}{tp.idx}</div>', content)

# Replace R suffix
# Pattern: <div class="tp-rr">{tp.rr}R</div>
content = re.sub(r'<div class="tp-rr">\{tp\.rr\}R</div>', '<div class="tp-rr">{tp.rr}{$_("dashboard.visualBar.riskUnit")}</div>', content)

with open(file_path, "w") as f:
    f.write(content)

print("Updated VisualBar.svelte")
