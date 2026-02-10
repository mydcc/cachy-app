path = "src/benchmarks/marketWatcher_backfill.test.ts"
with open(path, "r") as f:
    content = f.read()

# Insert (marketWatcher as any).isPolling = true; in beforeEach
marker = "(marketWatcher as any).historyLocks.clear();"
if marker in content:
    content = content.replace(marker, marker + "\n        (marketWatcher as any).isPolling = true;")
    with open(path, "w") as f:
        f.write(content)
    print("Fixed benchmark test")
else:
    print("Marker not found")
