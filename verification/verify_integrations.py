from playwright.sync_api import sync_playwright
import time
import json

def verify_integrations_tab(page):
    print("Setting up localStorage for Pro mode...")

    # Pre-populate localStorage with Pro enabled
    settings = {
        "isPro": True,
        "apiKeys": {
            "bitunix": {"key": "test_key", "secret": "test_secret"},
            "binance": {"key": "", "secret": ""}
        }
    }

    page.goto("http://localhost:3000")

    # Use the correct key from CONSTANTS
    page.evaluate(f"""() => {{
        localStorage.setItem('cryptoCalculatorSettings', '{json.dumps(settings)}');
    }}""")

    print("Reloading to apply settings...")
    page.reload()
    time.sleep(2) # Wait for hydration

    # Handle Legal Disclaimer if present
    try:
        print("Checking for Legal Disclaimer...")
        disclaimer_btn = page.get_by_role("button", name="I understand and accept")
        if disclaimer_btn.is_visible(timeout=3000):
            print("Clicking Legal Disclaimer...")
            disclaimer_btn.click()
            time.sleep(1)
    except:
        print("No disclaimer found or timed out.")

    # Open settings
    print("Opening settings...")
    try:
        page.locator("button.settings-btn").click()
    except:
        try:
             page.get_by_role("button", name="Settings").click()
        except:
             page.locator("button[title='Settings']").click()

    print("Waiting for modal...")
    modal = page.locator(".modal-content")
    modal.wait_for(state="visible")

    # Click Integrations Tab
    print("Clicking Integrations tab...")
    try:
        page.get_by_text("Integrations").click()
    except:
        page.locator("button[data-tab='integrations']").click()

    time.sleep(1)

    # Verify Eye Icon exists for Bitunix Key
    print("Verifying Eye Icon for Bitunix Key...")

    input_field = page.locator("#bitunix-api-key")
    if not input_field.is_visible():
        print("FAILURE: Bitunix API Key input not found. (Check isPro state)")
        page.screenshot(path="/home/jules/verification/failure_debug.png")
        return

    # Check the button next to it.
    toggle_btn = page.locator("#bitunix-api-key + button.toggle-btn")

    if toggle_btn.count() > 0:
        print("SUCCESS: Toggle button found next to Bitunix Key.")
    else:
        parent = page.locator("#bitunix-api-key").locator("..")
        btn = parent.locator("button")
        if btn.count() > 0:
             print("SUCCESS: Toggle button found in wrapper.")
             toggle_btn = btn.first
        else:
             print("FAILURE: Toggle button NOT found.")

    # Verify default type is password
    current_type = input_field.get_attribute('type')
    print(f"Input type before click: {current_type}")

    if current_type != "password":
         print("WARNING: Input type is not password initially.")

    # Click toggle
    print("Clicking toggle...")
    toggle_btn.click()
    time.sleep(0.5)

    # Verify type is now text
    new_type = input_field.get_attribute('type')
    print(f"Input type after click: {new_type}")

    if new_type == "text":
        print("SUCCESS: Input revealed.")
    else:
        print("FAILURE: Input NOT revealed.")

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="/home/jules/verification/integrations_tab.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_integrations_tab(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
