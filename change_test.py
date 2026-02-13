import sys

with open('src/tests/flash-close.test.ts', 'r') as f:
    content = f.read()

search_str = """        // This expectation confirms the vulnerability (missing cancel call)
        // Since we want to reproduce the bug (i.e., demonstrate it's missing),
        // we assert that it IS MISSING for now, then we will flip it to expect PRESENCE after fix.
        // OR better: assert it IS PRESENT, and let the test fail.
        // The prompt says "Create reproduction test...". A failing test is the reproduction.

        expect(cancelCall).toBeDefined();

        // Ensure Cancel happens BEFORE Close if both exist
        if (cancelCall) {
            const closeCall = calls.find((call: any) => call[2].side === 'SELL');
            const cancelIndex = calls.indexOf(cancelCall);
            const closeIndex = calls.indexOf(closeCall);
            expect(cancelIndex).toBeLessThan(closeIndex);
        }"""

replace_str = """        // Expect the Cancel All call to be present (Hardening Fix)
        expect(cancelCall).toBeDefined();

        // Ensure Close call is also present
        const closeCall = calls.find((call: any) => call[2] && call[2].side === 'SELL');
        expect(closeCall).toBeDefined();

        // Ensure Cancel happens BEFORE Close
        const cancelIndex = calls.indexOf(cancelCall);
        const closeIndex = calls.indexOf(closeCall);
        expect(cancelIndex).toBeLessThan(closeIndex);"""

if search_str in content:
    new_content = content.replace(search_str, replace_str)
    with open('src/tests/flash-close.test.ts', 'w') as f:
        f.write(new_content)
    print("Successfully updated test.")
else:
    print("Search string not found.")
