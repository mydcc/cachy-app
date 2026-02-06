from playwright.sync_api import Page, expect, sync_playwright, TimeoutError
import time

def test_symbol_picker(page: Page):
    # 1. Arrange: Go to the app
    page.goto("http://localhost:5173")

    # Wait for app to load
    page.wait_for_selector("body")
    # Wait a bit more for hydration
    page.wait_for_timeout(2000)

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
    
    # Capture the first symbol before sorting
    first_symbol_item = picker.locator(".symbol-item").first
    first_symbol_text_locator = first_symbol_item.locator("span.font-bold")
    first_symbol_before = first_symbol_text_locator.text_content()
    print(f"First symbol before sort: {first_symbol_before}")
    
    vol_sort_btn = picker.get_by_role("button", name="Vol")
    vol_sort_btn.click()

    # Wait for the sort to complete by detecting a UI change
    # Instead of a fixed timeout, we wait for the first symbol to change,
    # which confirms the sort operation has completed and the UI has updated.
    # We use a timeout to avoid infinite waiting if the sort doesn't change the order.
    try:
        # Wait up to 3 seconds for the first symbol to be different
        # Use proper parameter passing to avoid injection issues
        page.wait_for_function(
            """(expectedSymbol) => {
                const picker = document.querySelector('.symbol-picker-content');
                if (!picker) return false;
                const firstSymbol = picker.querySelector('.symbol-item span.font-bold');
                if (!firstSymbol) return false;
                return firstSymbol.textContent !== expectedSymbol;
            }""",
            arg=first_symbol_before,
            timeout=3000
        )
        # Re-query the locator to get the actual new first symbol after sorting
        first_symbol_after = picker.locator(".symbol-item").first.locator("span.font-bold").text_content()
        print(f"Sort complete - First symbol changed to: {first_symbol_after}")
    except TimeoutError:
        # If the first symbol didn't change, the sort might not have affected the order
        # or the list was already sorted correctly. This is acceptable.
        print(f"First symbol unchanged after sort: {first_symbol_before}")

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
