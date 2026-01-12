import time
from playwright.sync_api import sync_playwright

def verify_hotkey_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to ensure the modal fits and settings are visible
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        try:
            print("Navigating to app...")
            page.goto("http://localhost:5173", timeout=60000)
            # Use domcontentloaded instead of networkidle
            page.wait_for_load_state("domcontentloaded", timeout=60000)

            print("Page loaded. Waiting 5s for hydration...")
            time.sleep(5)

            print("Opening Settings Modal using hotkey Alt+,")
            page.keyboard.press("Alt+,")

            # Wait for modal content
            try:
                page.wait_for_selector(".modal-content", timeout=10000)
                print("Settings Modal Open")
            except:
                print("Modal didn't open with hotkey. Trying fallback hotkey logic or verifying if app handles it.")
                # Maybe hotkeys are not active yet? Focus body?
                page.click("body")
                page.keyboard.press("Alt+,")
                page.wait_for_selector(".modal-content", timeout=5000)
                print("Settings Modal Open (Retry)")

            # Click on 'Hotkeys' tab
            print("Switching to Hotkeys tab...")
            # Use get_by_role with text content. Tab usually has text inside.
            page.locator("button[role='tab']", has_text="Hotkeys").click()
            time.sleep(1)

            # Check if we see the "Switch to Custom Mode" message or the settings
            if page.get_by_text("Switch to Custom Mode to Edit").is_visible():
                print("Switching to Custom Mode...")
                page.get_by_role("button", name="Switch to Custom Mode to Edit").click()
                time.sleep(1)

            # Verify we see the categories
            print("Verifying categories...")
            if page.locator("h4", has_text="Trade Setup").is_visible():
                print(" - Trade Setup category visible")
            else:
                print(" - Trade Setup category NOT visible")

            # Verify we see an action like "Focus Entry Price"
            if page.get_by_text("Focus Entry Price").is_visible():
                print(" - Focus Entry Price action visible")

            # Take a screenshot of the Hotkey Settings UI
            screenshot_path = "verification/hotkey_settings_ui.png"
            page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_hotkey_ui()
