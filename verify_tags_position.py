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

def verify_tags_position():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:5173")
            page.wait_for_load_state("networkidle")

            # The structure should be:
            # - GeneralInputs (Trade Type, Leverage, Fees)
            # - TagInputs (The moved component)
            # - PortfolioInputs (Header "Portfolio")

            # Let's target the Portfolio Header
            portfolio_header = page.get_by_text("Portfolio", exact=True)
            if not portfolio_header.count():
                # Try getting by role heading if text varies
                portfolio_header = page.locator("h2", has_text="Portfolio")

            # Let's target the Tags input
            # Placeholder from TagInputs.svelte: $_('dashboard.tradeSetupInputs.tagsPlaceholder')
            # I need to know the English placeholder or class structure.
            # Looking at TagInputs.svelte: class="input-field ... flex-grow ... text-sm"
            # It's in a div with class "mb-4 relative"

            # Assuming English locale is default or "Tags" is placeholder
            tags_input = page.get_by_placeholder("Add tags...")
            if not tags_input.count():
                tags_input = page.locator("input[placeholder*='tag']") # Fallback

            # Take a screenshot of the left column area
            # We can select the parent container of these inputs
            # In +page.svelte: <div class="grid grid-cols-1 md:grid-cols-2 ..."> -> first div

            left_column = page.locator(".grid.grid-cols-1.md\\:grid-cols-2 > div").first

            left_column.screenshot(path="tags_verification.png")
            print("Screenshot saved to tags_verification.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="error_state.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_tags_position()
