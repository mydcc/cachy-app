files = [
    "src/tests/performance/market_overview_fetch_storm.test.ts",
    "src/utils/inputUtils.test.ts"
]

directive = "// @vitest-environment jsdom\n"

for path in files:
    try:
        with open(path, "r") as f:
            content = f.read()

        if "vitest-environment" not in content:
            with open(path, "w") as f:
                f.write(directive + content)
            print(f"Fixed env in {path}")
        else:
            print(f"Env already set in {path}")
    except FileNotFoundError:
        print(f"File not found: {path}")
