from playwright.sync_api import sync_playwright, expect
import time

def verify_trade_setup_inputs(page):
    # Navigate to the app
    page.goto("http://localhost:5173")

    # Wait for the app to load
    page.wait_for_selector(".section-header", timeout=10000)

    # Switch language to English if needed to match "Trade Setup" text,
    # but the prompt implies German UI might be default or used.
    # The code I modified used translations.
    # Let's target by ID or class if possible.

    # 1. Verify Arrows are removed from inputs
    page.screenshot(path="/home/jules/verification/trade_setup.png")

    # 2. Verify ATR Scan button is removed and List is present (after input)
    # Enable ATR
    # Check if 'use-atr-sl-checkbox' is checked. If not, check it.
    atr_checkbox = page.locator("#use-atr-sl-checkbox")
    if not atr_checkbox.is_checked():
        # Checkbox is hidden, click the label or wrapper?
        # The label has `for="use-atr-sl-checkbox"`
        page.locator("label[for='use-atr-sl-checkbox']").click()

    # Switch to 'auto' mode if not already
    # The error said strict mode violation.
    # "Auto" button for ATR Mode vs Auto Update Toggle (which has title/aria-label containing "Auto")
    # I should use specific class or exact text.
    auto_btn = page.locator("button.btn-switcher", has_text="Auto") # Selects the one with text "Auto"
    if "active" not in auto_btn.get_attribute("class"):
        auto_btn.click()

    # Enter a symbol to trigger scan
    symbol_input = page.locator("#symbol-input")
    symbol_input.fill("BTCUSDT")

    # Trigger input event just in case
    # symbol_input.dispatch_event("input")

    # Wait for debounce (0.5s) and fetch (network)
    # I'll wait a bit longer to be safe.
    # Or wait for a specific element.
    # The scan starts, `isScanningAtr` becomes true (spinner), then false.
    # Then buttons appear.
    # I can wait for text "4h:"
    try:
        page.wait_for_selector("text=4h:", timeout=10000)
    except:
        print("Timeout waiting for 4h ATR. Maybe fetch failed or logic issue.")

    # Take another screenshot
    page.screenshot(path="/home/jules/verification/atr_setup.png")

    # Assertions
    # Check for "SCAN" button - should NOT exist
    scan_btn = page.locator("button", has_text="SCAN")
    expect(scan_btn).not_to_be_visible()

    # Check for 4h ATR button
    expect(page.get_by_text("4h:")).to_be_visible()

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_trade_setup_inputs(page)
            print("Verification script finished successfully.")
        except Exception as e:
            print(f"Verification failed: {e}")
            # Take screenshot on failure
            page.screenshot(path="/home/jules/verification/failure.png")
        finally:
            browser.close()
