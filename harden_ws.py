import re

file_path = "src/services/bitunixWs.ts"

with open(file_path, "r") as f:
    content = f.read()

# Replace:
# listeners.forEach(cb => cb(item));
# With:
# listeners.forEach(cb => { try { cb(item); } catch (e) { console.error("[BitunixWS] Trade listener error:", e); } });

old_code = r'listeners.forEach\(cb => cb\(item\)\);'
new_code = r'listeners.forEach(cb => { try { cb(item); } catch (e) { if (import.meta.env.DEV) console.warn("[BitunixWS] Trade listener error:", e); } });'

content = re.sub(old_code, new_code, content)

with open(file_path, "w") as f:
    f.write(content)

print("Hardened BitunixWebSocketService")
