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
            # Try looking for text "Legal Disclaimer" or button
            disclaimer_btn = page.wait_for_selector('button:has-text("I understand and accept")', state='visible', timeout=5000)
            if disclaimer_btn:
                print("Clicking Disclaimer Accept...")
                disclaimer_btn.click()
                time.sleep(1) # Wait for animation
        except:
            print("No disclaimer blocking found.")

        # Wait for Settings Icon (using title attribute)
        print("Waiting for Settings icon...")
        page.wait_for_selector('button[title="Settings"]', state='visible', timeout=10000)
        page.click('button[title="Settings"]')

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
