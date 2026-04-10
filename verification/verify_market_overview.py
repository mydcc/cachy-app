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
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    print("Navigating to http://localhost:3000")
    try:
        page.goto("http://localhost:3000")

        # Wait for hydration
        page.wait_for_load_state("networkidle")

        # Take a screenshot of the whole page to confirm rendering
        page.screenshot(path="verification/market_overview.png")
        print("Screenshot saved to verification/market_overview.png")

        # Check for MarketOverview specific element class
        # The class "text-2xl font-bold tracking-tight flex" is used in MarketOverview
        element = page.locator(".text-2xl.font-bold.tracking-tight.flex")
        if element.count() > 0:
            print("MarketOverview component found!")
        else:
            print("Warning: MarketOverview component NOT found (possibly due to data loading state or visibility settings)")

    except Exception as e:
        print(f"Error: {e}")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
