# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.


from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Increase viewport size to ensure everything is visible
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        # 1. Navigate to the app
        print("Navigating to app...")
        page.goto("http://localhost:5173")
        time.sleep(2) # Wait for app to hydrate

        # 2. Open Settings
        print("Opening Settings...")
        # The settings button has title="Settings"
        settings_btn = page.get_by_role("button", name="Settings").first
        if not settings_btn.is_visible():
             # Fallback: try by title attribute directly if role lookup fails
             settings_btn = page.locator('button[title="Settings"]')

        settings_btn.click()
        time.sleep(1)

        # 3. Navigate to AI Chat tab
        print("Navigating to AI Chat tab...")
        # The tab likely has text "AI Chat"
        ai_tab = page.get_by_role("tab", name="AI Chat")
        if not ai_tab.is_visible():
             # Try finding by text if role is not strictly 'tab'
             ai_tab = page.get_by_text("AI Chat")

        ai_tab.click()
        time.sleep(1)

        # 4. Navigate to "Agents" sub-tab (where Twitter monitors were)
        print("Navigating to Agents sub-tab...")
        agents_tab = page.get_by_role("button", name="Agents")
        agents_tab.click()
        time.sleep(1)

        # 5. Verify removal
        print("Verifying removal...")
        # Take a screenshot of the Agents tab
        page.screenshot(path="/home/jules/verification/verification.png")

        # Check that "X / Twitter Monitors" text is NOT present
        # We expect this to fail (to find the element), so we invert the check
        twitter_monitors = page.get_by_text("X / Twitter Monitors")

        if twitter_monitors.count() > 0 and twitter_monitors.is_visible():
            print("ERROR: 'X / Twitter Monitors' text is still visible!")
            exit(1)
        else:
            print("SUCCESS: 'X / Twitter Monitors' text is NOT visible.")

        # Check that "Discord Bot" IS present (to ensure we are on the right tab)
        discord_bot = page.get_by_text("Discord Bot")
        expect(discord_bot).to_be_visible()
        print("SUCCESS: 'Discord Bot' text is visible (Context correct).")

        browser.close()

if __name__ == "__main__":
    run()
