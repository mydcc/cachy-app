from playwright.sync_api import Page, expect, sync_playwright
import time

def test_symbol_picker(page: Page):
    # 1. Arrange: Go to the app
    page.goto("http://localhost:5173")

    # Wait for app to load
    page.wait_for_selector("body")
    # Wait for network to be idle (app hydrated)
    page.wait_for_load_state('networkidle')

    # 2. Act: Open Symbol Picker
    # Press Alt+F
    print("Pressing Alt+F...")
    page.keyboard.press("Alt+F")

    # 3. Assert: Picker is open
    # Look for "Pairs" text which is in the header
    picker = page.locator(".symbol-picker-content")
    expect(picker).to_be_visible(timeout=5000)
    print("Picker visible.")

    # 4. Act: Filter by Volume
    # Find the select box for volume.
    vol_select = picker.locator("select")
    print("Selecting 10M+ volume...")
    vol_select.select_option("10000000") # 10M+

    # 5. Act: Toggle Majors Only
    # Label contains "Majors Only"
    # Note: get_by_label might not work if the input is wrapped or not strictly associated.
    # The code has <label><input><span>Majors Only</span></label>. This usually works.
    print("Checking Majors Only...")
    # Trying get_by_text since label association might be tricky with implicit label
    majors_label = picker.get_by_text("Majors Only")
    majors_label.click()

    # 6. Act: Sort by Volume
    # Button with text "Vol"
    print("Sorting by Volume...")
    vol_sort_btn = picker.get_by_role("button", name="Vol")
    vol_sort_btn.click()

    # Wait a bit for sorting/filtering to settle
    page.wait_for_timeout(1000)

    # 7. Screenshot
    page.screenshot(path="verification/picker_optimized.png")
    print("Screenshot saved to verification/picker_optimized.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_symbol_picker(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
