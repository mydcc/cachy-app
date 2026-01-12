import time
from playwright.sync_api import sync_playwright

def verify_legacy_hotkeys():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to ensure the modal fits and settings are visible
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        try:
            print("Navigating to app...")
            page.goto("http://localhost:5173", timeout=60000)
            page.wait_for_load_state("domcontentloaded", timeout=60000)

            # Handle Disclaimer
            try:
                page.wait_for_selector("text=I understand and accept", timeout=5000)
                page.click("text=I understand and accept")
                print("Disclaimer accepted.")
            except:
                pass

            time.sleep(2)

            print("Opening Settings Modal via Button...")
            try:
                page.click("button[aria-label='Settings']")
            except:
                page.locator(".btn-icon-accent").first.click()

            page.wait_for_selector(".modal-content", timeout=5000)
            print("Settings Modal Open")

            # Go to Behavior tab
            print("Switching to Behavior tab...")
            page.locator("button[role='tab']", has_text="Behavior").click()
            time.sleep(1)

            # Check Default Mode (Safety Mode)
            # We expect to see the list of active hotkeys
            print("Verifying Safety Mode Hotkey List...")
            # We look for "Active Hotkeys" and verify new ones are present
            # E.g., "Alt+B" or "Alt+K"

            # Since the content is dynamic, we check for presence of specific key text
            if page.locator(".font-mono", has_text="Alt+B").is_visible():
                print(" - Alt+B (Sidebar) found in Safety Mode list")
            else:
                print(" - Alt+B (Sidebar) NOT found in Safety Mode list")

            # Change to Direct Mode
            print("Switching to Direct Mode...")
            page.select_option("select", value="mode1")
            time.sleep(0.5)

            print("Verifying Direct Mode Hotkey List...")
            # Should see "B" (Sidebar) without Alt
            # Note: Selector might need to be specific to the table/list
            if page.locator(".font-mono", has_text="B").first.is_visible():
                 print(" - B (Sidebar) found in Direct Mode list")
            else:
                 print(" - B (Sidebar) NOT found in Direct Mode list")

            # Take a screenshot
            screenshot_path = "verification/hotkey_legacy_ui.png"
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error_legacy.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_legacy_hotkeys()
