from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            print("Navigating to http://localhost:5173/...")
            page.goto("http://localhost:5173/")

            # Wait for initial load
            page.wait_for_timeout(3000)

            # Check if we need to enable technicals in settings?
            # Or just take a screenshot of what's there.
            # The "Technicals" panel title should be visible if enabled.

            print("Taking screenshot...")
            page.screenshot(path="/tmp/frontend_verify.png", full_page=True)
            print("Screenshot saved.")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
