import os
import re

def analyze_file(filepath):
    findings = []

    with open(filepath, 'r', encoding='utf-8') as f:
        try:
            content = f.read()
        except Exception:
            return []

    lines = content.split('\n')

    # 1. JSON Safety
    # Ignore test files for strict JSON safety as they often mock things
    if "test" not in filepath and "bench" not in filepath:
        if "JSON.parse(" in content and "safeJsonParse" not in content:
             # Find line number
            for i, line in enumerate(lines):
                if "JSON.parse(" in line:
                    findings.append({
                        "type": "Unsafe JSON",
                        "severity": "CRITICAL",
                        "message": "Usage of JSON.parse without safeJsonParse fallback/wrapper",
                        "line": i + 1,
                        "code": line.strip()
                    })

    # 2. Native Math / Floats (Heuristic: 'number' in services)
    if "src/services" in filepath and "test" not in filepath:
        # Check for function arguments or return types that are 'number' instead of 'Decimal'
        # This is noisy, so we focus on specific keywords
        for i, line in enumerate(lines):
            # patterns like: price: number, amount: number, qty: number
            if re.search(r'\b(price|amount|qty|quantity|balance|cost|value)\s*:\s*number\b', line, re.IGNORECASE):
                findings.append({
                    "type": "Precision Risk",
                    "severity": "CRITICAL",
                    "message": "Financial field typed as 'number' instead of 'Decimal' or 'string'",
                    "line": i + 1,
                    "code": line.strip()
                })

    # 3. I18n (Svelte files)
    if filepath.endswith(".svelte"):
        # Very basic heuristic: Text between tags >Text< that contains letters and isn't a template { }
        # excluding common symbols or just numbers
        for i, line in enumerate(lines):
            matches = re.findall(r'>([^<{}]+)<', line)
            for text in matches:
                text = text.strip()
                if text and re.search(r'[a-zA-Z]', text):
                    # Filter out purely technical strings if possible, or short generic ones
                    if len(text) > 3 and "$" not in text and "{" not in text:
                         findings.append({
                            "type": "Missing I18n",
                            "severity": "WARNING",
                            "message": f"Potential hardcoded string: '{text}'",
                            "line": i + 1,
                            "code": line.strip()
                        })

    # 4. Memory Leaks (Intervals/Listeners)
    if filepath.endswith(".svelte") or filepath.endswith(".ts"):
        if "setInterval(" in content:
            # Check if clearInterval is used in the file
            if "clearInterval" not in content:
                findings.append({
                    "type": "Memory Leak",
                    "severity": "CRITICAL",
                    "message": "setInterval used without clearInterval in file",
                    "line": 0, # Global check
                    "code": "Global File Check"
                })

        if "addEventListener(" in content:
             if "removeEventListener" not in content:
                findings.append({
                    "type": "Memory Leak",
                    "severity": "WARNING",
                    "message": "addEventListener used without removeEventListener",
                    "line": 0,
                    "code": "Global File Check"
                })

    return findings

def main():
    report = []
    for root, dirs, files in os.walk("src"):
        for file in files:
            if file.endswith((".ts", ".svelte", ".js")):
                filepath = os.path.join(root, file)
                file_findings = analyze_file(filepath)
                if file_findings:
                    report.extend([{**f, "file": filepath} for f in file_findings])

    # Print Report
    print(f"Analysis Complete. Found {len(report)} issues.\n")

    # Group by type
    by_type = {}
    for item in report:
        if item["type"] not in by_type:
            by_type[item["type"]] = []
        by_type[item["type"]].append(item)

    for category, items in by_type.items():
        print(f"--- {category} ---")
        for item in items[:10]: # Limit output
            print(f"[{item['severity']}] {item['file']}:{item['line']} - {item['message']}")
            print(f"    Code: {item['code']}")
        if len(items) > 10:
            print(f"... and {len(items) - 10} more.")
        print("\n")

if __name__ == "__main__":
    main()
