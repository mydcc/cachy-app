import time
from playwright.sync_api import sync_playwright

def verify_guide():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Navigate to the app (assuming it's running on port 5173)
        page.goto("http://localhost:5173")

        # Wait for the app to load
        page.wait_for_selector("body")

        # Click the 'Guide' button to open the modal
        # Assuming there is a button with text "Guide" or similar
        # Based on previous file reads, it might be an icon or a button in the footer/header
        # Let's try to find a button with 'Guide' text or aria-label
        # Checking Header.svelte or DashboardNav...
        # Actually in app.ts: app.uiManager.showReadme('guide') is called.
        # Let's look for a button that triggers this.
        # In JournalView.svelte there was a button with icon 'book' for instructions.
        # In Header.svelte? Let's assume there is a button "Guide" or similar on the main page.

        # Taking a screenshot of the main page first to see where the button is if we fail
        page.screenshot(path="verification/main_page.png")

        # Try to find the button. In guide.en.md it says: (via the "Guide" button)
        try:
            # Try to find by text "Guide" or "Anleitung"
            page.get_by_text("Guide", exact=False).first.click()
        except:
            print("Could not find 'Guide' text, trying icon button...")
            # Maybe it's an icon button.
            # Let's try to evaluate specific JS to open it if UI interaction fails,
            # but better to find the button.
            # Let's look for a button with '?' or 'Book' icon.
            pass

        # Wait for modal content to appear
        time.sleep(2)

        # Take screenshot of the guide modal
        page.screenshot(path="verification/guide_modal.png")

        browser.close()

if __name__ == "__main__":
    verify_guide()
