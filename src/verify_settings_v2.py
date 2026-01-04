from playwright.sync_api import sync_playwright

def verify_settings_v2(page):
    print("Navigating to home page...")
    page.goto("http://localhost:5173")

    # Open settings
    print("Opening settings...")
    page.get_by_role("button", name="Settings").click()

    print("Waiting for modal...")
    modal = page.locator(".modal-content")
    modal.wait_for(state="visible")

    # Check OK button inside modal
    print("Checking for OK button...")
    ok_btn = modal.get_by_role("button", name="OK")
    if ok_btn.count() > 0:
        print("SUCCESS: OK button found inside modal.")
    else:
        print("FAILURE: OK button NOT found inside modal.")

    # Check Save button inside modal (should be gone)
    save_btn = modal.get_by_role("button", name="Save")
    if save_btn.count() == 0:
        print("SUCCESS: Save button is gone.")
    else:
        print("FAILURE: Save button still exists inside modal!")

    # Check width indirectly by visual inspection of screenshot
    print("Taking screenshot...")
    page.screenshot(path="/home/jules/verification/settings_v2.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_settings_v2(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
