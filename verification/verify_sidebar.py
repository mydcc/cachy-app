from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:5173")

    # Wait for page load
    page.wait_for_timeout(3000)

    # Check for Sidebar visibility (might need wide screen)
    page.set_viewport_size({"width": 1400, "height": 900})
    page.wait_for_timeout(1000)

    # Take screenshot of the sidebar area
    # Sidebar is sticky, let's just screenshot the whole page or finding the sidebar element
    # The sidebar has class "w-96 shrink-0 sticky"

    # Also verify text "Positions" is present (localized)
    content = page.content()
    if "Positions" in content:
        print("Found 'Positions' text")

    # Attempt to click "Save Journal" to trigger toast?
    # Button ID: save-journal-btn
    # But it might be disabled if position size is "-"

    page.screenshot(path="verification/sidebar.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
