from playwright.sync_api import sync_playwright, expect
import time

def verify_translations():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        try:
            print("Navigating to app...")
            page.goto("http://localhost:5173")
            # Relaxed wait
            page.wait_for_load_state("domcontentloaded")

            print("Checking for disclaimer...")
            accept_btn = page.locator("button:has-text('accept'), button:has-text('akzeptiert')")

            if accept_btn.is_visible(timeout=5000):
                print("Clicking legal disclaimer...")
                accept_btn.first.click()
                time.sleep(1)

            print("Opening settings...")
            # If settings not open, click button
            settings_heading = page.locator("h2, h3").filter(has_text="Settings")
            if not settings_heading.is_visible():
                page.locator("button[title='Settings']").click()

            expect(settings_heading).to_be_visible()

            print("Navigating to Integrations tab...")
            # Try English label
            try:
                # We try both the label and the raw key, just to be sure we find it
                tab = page.locator("button").filter(has_text="Integrations").or_(page.locator("button").filter(has_text="settings.tabs.integrations"))
                tab.first.click()
            except Exception as e:
                print(f"Tab nav error: {e}")

            print("Taking screenshot of Integrations tab...")
            time.sleep(2) # Allow render
            page.screenshot(path="/app/verification/integrations_tab_en.png")

            body_text = page.locator("body").inner_text()

            # Check for specific new keys
            checks = {
                "Exchange Connectivity": "settings.integrations.exchanges",
                "Enter API Key": "settings.integrations.enterKey"
            }

            for expected, raw_key in checks.items():
                if expected in body_text:
                    print(f"SUCCESS: Found '{expected}'")
                elif raw_key in body_text:
                    print(f"FAILURE: Found raw key '{raw_key}'")
                else:
                    print(f"WARNING: Found neither '{expected}' nor '{raw_key}'")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/app/verification/error_retry_2.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_translations()
