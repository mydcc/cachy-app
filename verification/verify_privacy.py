from playwright.sync_api import sync_playwright

def verify_privacy_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to ensure the footer is visible without scrolling issues if content is short
        context = browser.new_context(viewport={"width": 1280, "height": 1024})
        page = context.new_page()

        # 1. Navigate to the app
        print("Navigating to http://localhost:5173")
        page.goto("http://localhost:5173")

        # Wait for the page to load
        page.wait_for_load_state("networkidle")

        # 2. Check for the footer link "Privacy & Legal"
        print("Checking for footer link...")
        privacy_link = page.get_by_role("button", name="Privacy & Legal")

        if privacy_link.is_visible():
            print("Privacy link found.")
        else:
            print("Privacy link NOT found.")
            page.screenshot(path="verification/failed_link_check.png")
            return

        # 3. Click the link
        print("Clicking Privacy link...")
        privacy_link.click()

        # 4. Wait for modal to appear
        print("Waiting for modal...")
        # The modal title usually appears in an h2 or similar
        modal_title = page.get_by_role("heading", name="Privacy & Legal")
        modal_title.wait_for(state="visible", timeout=5000)

        # 5. Take screenshot of the modal
        print("Taking screenshot...")
        page.screenshot(path="verification/privacy_modal.png")

        # 6. Verify content text (basic check)
        # Check for English content since default is English
        content_check = page.get_by_text("Effective Date: 2024")
        if content_check.is_visible():
            print("English content verified.")
        else:
            print("English content NOT found.")

        browser.close()

if __name__ == "__main__":
    verify_privacy_modal()
