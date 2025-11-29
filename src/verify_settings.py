from playwright.sync_api import Page, expect, sync_playwright

def verify_settings_modal(page: Page):
    # 1. Arrange: Go to the app homepage.
    page.goto("http://localhost:5173")

    # 2. Act: Open the settings modal.
    # Assuming there's a settings button, find it by aria-label or title as defined in constants/locales
    # Using a selector based on the probable icon or button class if aria-label isn't immediately obvious,
    # but based on code, there is a SettingsButton component.
    # Let's try to find the button that triggers the settings modal.
    # In +layout.svelte or +page.svelte, there should be a button.
    # Inspecting previous grep outputs or reasoning: usually a gear icon.
    # Let's wait for the page to load.
    page.wait_for_load_state("networkidle")

    # Try to find the settings button. It might be an SVG or have a specific class.
    # Let's assume it has an aria-label "Settings" or similar if localized, or just look for the button in the header/footer.
    # Since I don't have the exact selector, I'll try to find it by a common pattern or just screenshot the main page first to see where it is.
    # However, I know I added "API Provider" to the settings modal.

    # Let's try to find a button that opens settings.
    # In `src/components/layout/Header.svelte` or similar?
    # Let's try to target the button by its expected icon content or class.
    # Based on the file list, `src/components/settings/SettingsButton.svelte` exists.
    # Let's click it.

    page.get_by_role("button", name="Settings").first.click() # Heuristic

    # Wait for modal to appear
    expect(page.get_by_text("Settings")).to_be_visible()

    # 3. Assert: Check if "API Provider" dropdown exists.
    expect(page.get_by_text("API Provider")).to_be_visible()
    expect(page.locator("select#api-provider-select")).to_be_visible()

    # 4. Screenshot
    page.screenshot(path="/home/jules/verification/settings_modal_verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_settings_modal(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
