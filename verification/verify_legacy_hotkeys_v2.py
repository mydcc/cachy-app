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
            print("Verifying Safety Mode Hotkey List...")
            if page.locator(".font-mono", has_text="Alt+B").is_visible():
                print(" - Alt+B (Sidebar) found in Safety Mode list")
            else:
                print(" - Alt+B (Sidebar) NOT found in Safety Mode list")

            # Change to Direct Mode
            print("Switching to Direct Mode...")
            # Use a more specific selector for the select element.
            # We look for the select that contains "mode1" or "Direct Mode"
            # Since options usually have values or text

            # Try selecting by label text if available, or just find the select with the right option value
            select_element = page.locator("select").filter(has=page.locator("option[value='mode1']"))
            select_element.select_option("mode1")

            time.sleep(0.5)

            print("Verifying Direct Mode Hotkey List...")
            # Should see "B" (Sidebar) without Alt.
            # We need to be careful not to match "Alt+B" when looking for "B".
            # Ideally verify strict text match or just visual check.
            # But "B" is distinct from "Alt+B" if we check exact text of the span

            # Using has_text might be loose. Let's try exact text on span
            if page.locator(".font-mono:text-is('B')").is_visible():
                 print(" - B (Sidebar) found in Direct Mode list")
            else:
                 # Fallback check
                 print(" - Checking looser match for B...")
                 if page.locator(".font-mono", has_text="B").count() > 0:
                     print(" - B found (loose match)")
                 else:
                     print(" - B NOT found")

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
