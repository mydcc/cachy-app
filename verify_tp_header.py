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
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Set viewport to capture full width desktop view
        page.set_viewport_size({"width": 1280, "height": 800})

        print("Navigating to dashboard...")
        try:
            # Change wait_until to domcontentloaded to be less strict
            page.goto("http://localhost:5173", timeout=60000, wait_until="domcontentloaded")
        except Exception as e:
            print(f"Error navigating: {e}")
            return

        print("Checking for TP section...")

        # Wait for the element explicitly
        try:
            # Try to find the section header by text
            page.wait_for_selector("text=Take-Profit", timeout=10000)
            tp_section = page.get_by_text("Take-Profit", exact=False).first

            if tp_section.is_visible():
                print("Found TP section header.")
                tp_section.scroll_into_view_if_needed()
                time.sleep(1)
            else:
                print("Could not find TP section header by text.")
        except Exception as e:
            print(f"Error finding selector: {e}")

        # Take screenshot regardless to see what's going on
        os.makedirs("/home/jules/verification", exist_ok=True)
        screenshot_path = "/home/jules/verification/verification_header_v2.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
