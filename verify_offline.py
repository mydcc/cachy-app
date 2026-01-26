from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_offline_banner(page: Page):
    print("Navigating to app...")
    page.goto("http://localhost:5173")

    # Wait for hydration
    page.wait_for_timeout(3000)

    print("Simulating Offline Mode...")
    page.context.set_offline(True)

    # The banner should appear
    # Locator: data-testid="offline-banner" or text "Connection Lost"
    banner = page.get_by_test_id("offline-banner")

    # Wait for it
    print("Waiting for banner...")
    expect(banner).to_be_visible(timeout=5000)

    print("Taking screenshot...")
    page.screenshot(path="/home/jules/verification/offline_banner.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            verify_offline_banner(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
