import time
from playwright.sync_api import sync_playwright

def verify_hotkey_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        try:
            print("Navigating to app...")
            page.goto("http://localhost:5173", timeout=60000)
            page.wait_for_load_state("domcontentloaded", timeout=60000)

            print("Handling Disclaimer if present...")
            # Wait for disclaimer
            try:
                page.wait_for_selector("text=I understand and accept", timeout=5000)
                page.click("text=I understand and accept")
                print("Disclaimer accepted.")
            except:
                print("No disclaimer found or already accepted.")

            time.sleep(2)

            print("Opening Settings Modal via Button...")
            # The button has aria-label="Settings" (or translation key 'settings.title' which defaults to Settings)
            # We'll try finding the button by aria-label "Settings"
            try:
                page.click("button[aria-label='Settings']")
            except:
                print("Could not find button by label, trying selector .btn-icon-accent")
                # Fallback to class if needed, or get by role
                page.locator(".btn-icon-accent").first.click()

            page.wait_for_selector(".modal-content", timeout=5000)
            print("Settings Modal Open")

            # Click on 'Hotkeys' tab
            print("Switching to Hotkeys tab...")
            page.locator("button[role='tab']", has_text="Hotkeys").click()
            time.sleep(1)

            # Check if we see the "Switch to Custom Mode" message
            if page.get_by_text("Switch to Custom Mode to Edit").is_visible():
                print("Switching to Custom Mode...")
                page.get_by_role("button", name="Switch to Custom Mode to Edit").click()
                time.sleep(1)

            # Verify categories
            print("Verifying categories...")
            if page.locator("h4", has_text="Trade Setup").is_visible():
                print(" - Trade Setup category visible")
            else:
                print(" - Trade Setup category NOT visible")

            # Verify specific action
            if page.get_by_text("Focus Entry Price").is_visible():
                print(" - Focus Entry Price action visible")

            # Take a screenshot
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
