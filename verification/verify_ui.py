from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        # 1. Navigate
        print("Navigating to app...")
        page.goto("http://localhost:5176")

        # 2. Wait for Settings Button and Click
        print("Opening Settings...")
        settings_btn = page.locator('button[title="Settings"]')
        settings_btn.wait_for()
        settings_btn.click()

        # 3. Wait for Modal
        print("Waiting for modal...")
        page.get_by_role("dialog").wait_for()

        # 4. Switch to System Tab
        print("Switching to System Tab...")
        system_tab = page.get_by_role("tab", name="System")
        system_tab.wait_for()
        system_tab.click()

        # 5. Wait for Calculation Settings content
        print("Waiting for Calculation Settings...")
        page.get_by_role("heading", name="Performance Profiles").wait_for()

        # 6. Scroll down manually via JS
        print("Scrolling...")
        # The scrollable container has class 'custom-scrollbar' (from SettingsModal.svelte)
        # There are two: one for sidebar, one for content. Content is the second one usually or inside flex-1.
        # Let's try selecting by generic class in the modal body.
        page.evaluate("""
            const containers = document.querySelectorAll('.custom-scrollbar');
            // The content container is likely the one with more height or the second one.
            // Let's scroll both just in case.
            containers.forEach(c => c.scrollTop = 600);
        """)

        page.wait_for_timeout(500) # Wait for render

        # 7. Screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/settings_ui_scrolled.png")

        browser.close()
        print("Done.")

if __name__ == "__main__":
    run()
