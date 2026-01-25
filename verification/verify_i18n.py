from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:3000")
            # Wait for content
            page.wait_for_selector("body")

            # Check for "Leverage" text which proves the English key loaded
            # Because we replaced hardcoded string with key, seeing "Leverage" means i18n works.
            # If it failed, we might see the key name or blank.
            page.wait_for_selector("text=Leverage", timeout=5000)

            # Take screenshot
            page.screenshot(path="verification/i18n_check.png")
            print("Screenshot taken.")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
