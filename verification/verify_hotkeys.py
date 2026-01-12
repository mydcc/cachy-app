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
            page.goto("http://localhost:5173")
            page.wait_for_load_state("networkidle")

            # Inject settings to ensure we are in a clean state, or just use UI
            # Let's use UI navigation to be safe.

            print("Opening Settings Modal...")
            # Assuming there is a settings button. Usually it's a gear icon.
            # Based on codebase, it might be in the sidebar or header.
            # Let's look for a button with aria-label or accessible name "Settings"
            # Or try the hotkey Alt+, which we just defined!

            # Wait a bit for initialization
            time.sleep(2)

            # Try to click settings button if visible
            settings_btn = page.locator('button[aria-label="Settings"]')
            if settings_btn.is_visible():
                settings_btn.click()
            else:
                # Try locating by icon or class if needed, or fallback to key press
                print("Settings button not found by aria-label, trying key press Alt+,")
                page.keyboard.press("Alt+,")

            page.wait_for_selector(".modal-content", timeout=5000)
            print("Settings Modal Open")

            # Click on 'Hotkeys' tab
            print("Switching to Hotkeys tab...")
            page.get_by_role("tab", name="Hotkeys").click()
            time.sleep(1)

            # Check if we see the "Switch to Custom Mode" message or the settings
            # Default is Safety Mode, so we should see the "Switch" button
            if page.get_by_text("Switch to Custom Mode to Edit").is_visible():
                print("Switching to Custom Mode...")
                page.get_by_role("button", name="Switch to Custom Mode to Edit").click()
                time.sleep(0.5)

            # Verify we see the categories
            print("Verifying categories...")
            if page.get_by_text("Trade Setup").is_visible():
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
