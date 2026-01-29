from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to home...")
        page.goto("http://localhost:5173")

        # Handle Disclaimer if it exists
        try:
            print("Checking for Disclaimer...")
            disclaimer_btn = page.wait_for_selector('button:has-text("I understand and accept")', timeout=5000)
            if disclaimer_btn:
                print("Clicking Disclaimer Accept...")
                disclaimer_btn.click()
        except:
            print("No disclaimer found or timed out (might be already accepted or not blocking).")

        # Wait for Settings Icon
        print("Waiting for Settings icon...")
        # Try a more robust selector or just wait longer
        page.wait_for_selector('button[aria-label="Settings"]', state='visible', timeout=20000)
        page.click('button[aria-label="Settings"]')

        print("Waiting for Settings Modal...")
        page.wait_for_selector('.settings-modal', state='visible')

        print("Clicking System Tab...")
        page.click('text=System')

        print("Clicking Dashboard Sub-tab...")
        page.click('button:has-text("Dashboard")')

        time.sleep(2)

        print("Taking screenshot...")
        element = page.locator('.settings-modal')
        element.screenshot(path="/home/jules/verification/dashboard_final_check.png")

        print("Screenshot saved to /home/jules/verification/dashboard_final_check.png")
        browser.close()

if __name__ == "__main__":
    run()
