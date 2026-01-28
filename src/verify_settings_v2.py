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

def verify_settings_v2(page):
    print("Navigating to home page...")
    page.goto("http://localhost:5173")

    # Open settings
    print("Opening settings...")
    page.get_by_role("button", name="Settings").click()

    print("Waiting for modal...")
    modal = page.locator(".modal-content")
    modal.wait_for(state="visible")

    # Check OK button inside modal
    print("Checking for OK button...")
    ok_btn = modal.get_by_role("button", name="OK")
    if ok_btn.count() > 0:
        print("SUCCESS: OK button found inside modal.")
    else:
        print("FAILURE: OK button NOT found inside modal.")

    # Check Save button inside modal (should be gone)
    save_btn = modal.get_by_role("button", name="Save")
    if save_btn.count() == 0:
        print("SUCCESS: Save button is gone.")
    else:
        print("FAILURE: Save button still exists inside modal!")

    # Check width indirectly by visual inspection of screenshot
    print("Taking screenshot...")
    page.screenshot(path="/home/jules/verification/settings_v2.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_settings_v2(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
