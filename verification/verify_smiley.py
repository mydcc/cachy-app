from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    try:
        print("Navigating to dashboard...")
        page.goto("http://localhost:5173")
        page.wait_for_timeout(5000) # Wait for hydration

        print("Taking screenshot...")
        page.screenshot(path="verification/dashboard.png")
        print("Screenshot saved.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
