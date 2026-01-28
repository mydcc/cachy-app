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

from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.goto("http://localhost:5173")

    # Wait for page load
    page.wait_for_timeout(3000)

    # Check for Sidebar visibility (might need wide screen)
    page.set_viewport_size({"width": 1400, "height": 900})
    page.wait_for_timeout(1000)

    # Take screenshot of the sidebar area
    # Sidebar is sticky, let's just screenshot the whole page or finding the sidebar element
    # The sidebar has class "w-96 shrink-0 sticky"

    # Also verify text "Positions" is present (localized)
    content = page.content()
    if "Positions" in content:
        print("Found 'Positions' text")

    # Attempt to click "Save Journal" to trigger toast?
    # Button ID: save-journal-btn
    # But it might be disabled if position size is "-"

    page.screenshot(path="verification/sidebar.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
