from playwright.sync_api import sync_playwright

def verify_settings(page):
    # Port seems to be 5173 by default even if PORT=3005 is set?
    # Vite dev server output said "Local: http://localhost:5173/"
    page.goto("http://localhost:5173")

    # Wait for page to load
    page.wait_for_timeout(2000)

    # Screenshot main page to confirm we are there
    page.screenshot(path="/home/jules/verification/main_page.png")

    try:
        # Try to find the settings button.
        # It usually has title "Settings" or "Einstellungen".
        # Let's try to find it by icon or title.
        # Using a selector that looks for the title attribute.
        page.click("button[title='Einstellungen']")
        print("Clicked Settings button")
    except Exception as e:
        print(f"Could not click 'Einstellungen', trying 'Settings': {e}")
        try:
             page.click("button[title='Settings']")
             print("Clicked Settings button (English)")
        except Exception as e2:
             print(f"Could not click 'Settings' either: {e2}")
             # Let's try to just open the modal via JS if possible, or fail.


    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/settings_modal.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_settings(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
