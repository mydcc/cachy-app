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

        # 1. Navigate to Home
        print("Navigating to home...")
        page.goto("http://localhost:5173")

        # 2. Wait for Settings Icon and Click
        print("Waiting for Settings icon...")
        page.wait_for_selector('button[aria-label="Settings"]', state='visible', timeout=10000)
        page.click('button[aria-label="Settings"]')

        # 3. Wait for Settings Modal
        print("Waiting for Settings Modal...")
        page.wait_for_selector('.settings-modal', state='visible')

        # 4. Click "System" Tab
        print("Clicking System Tab...")
        # The sidebar items often have text "System"
        page.click('text=System')

        # 5. Click "Dashboard" Sub-tab
        print("Clicking Dashboard Sub-tab...")
        # Looking for the sub-navigation button "Dashboard"
        page.click('button:has-text("Dashboard")')

        # 6. Wait for content to load
        time.sleep(1)

        # 7. Take Screenshot of the dashboard content
        print("Taking screenshot...")
        # Ensure we capture the specific part or the whole modal
        # We target the specific container class if possible, or just the modal
        element = page.locator('.settings-modal')
        element.screenshot(path="/home/jules/verification/dashboard_final_check.png")

        print("Screenshot saved to /home/jules/verification/dashboard_final_check.png")
        browser.close()

if __name__ == "__main__":
    run()
