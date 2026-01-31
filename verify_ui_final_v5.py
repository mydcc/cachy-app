# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

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
            disclaimer_btn = page.wait_for_selector('button:has-text("I understand and accept")', state='visible', timeout=5000)
            if disclaimer_btn:
                print("Clicking Disclaimer Accept...")
                disclaimer_btn.click()
                time.sleep(1)
        except:
            print("No disclaimer blocking found.")

        # Wait for Settings Icon (using title attribute)
        print("Waiting for Settings icon...")
        page.wait_for_selector('button[title="Settings"]', state='visible', timeout=10000)
        page.click('button[title="Settings"]')

        print("Waiting for Modal Content...")
        page.wait_for_selector('.modal-content', state='visible')

        print("Clicking System Tab...")
        page.click('button[role="tab"]:has-text("System")')

        print("Clicking Dashboard Sub-tab...")
        # Note: CalculationDashboard might be just rendered in SystemTab or as a sub-component.
        # In SettingsModal.svelte, <SystemTab /> is rendered.
        # We need to find the Dashboard button inside SystemTab.
        # Let's just wait a second and look for "System Performance Dashboard" title if it's there.
        # Or check if there are sub-tabs in SystemTab.

        time.sleep(1)

        # Check if we need to click "Dashboard" sub-tab in SystemTab.
        # I'll try to find text "Dashboard" that is clickable.
        if page.locator('button:has-text("Dashboard")').count() > 0:
             page.click('button:has-text("Dashboard")')

        time.sleep(2)

        print("Taking screenshot...")
        element = page.locator('.modal-content')
        element.screenshot(path="/home/jules/verification/dashboard_final_check.png")

        print("Screenshot saved to /home/jules/verification/dashboard_final_check.png")
        browser.close()

if __name__ == "__main__":
    run()
