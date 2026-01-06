from playwright.sync_api import sync_playwright

def verify_settings_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a standard desktop viewport
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        try:
            # Navigate to the app
            page.goto("http://localhost:5173", timeout=60000)

            # Inject data to ensure sidebars and modal logic work
            page.add_init_script("""
                localStorage.setItem('settingsStore', JSON.stringify({
                    apiKeys: { bitunix: { key: 'dummy', secret: 'dummy' }, binance: { key: '', secret: '' } },
                    showSidebars: true
                }));
            """)
            # Force reload to apply storage
            page.reload()

            # Try to find the settings button by aria-label or title (which are localized)
            # The code uses $_('settings.title'). 'Settings' is default if English.
            # But the file SettingsButton.svelte uses aria-label={$_('settings.title')}

            # We can also target the class btn-icon-accent or the SVG
            # Best is to try 'Settings' or use the class if unique enough.
            # Actually, let's look for the button with the specific SVG path or just the class .btn-icon-accent which is rare?

            # Try english "Settings"
            try:
                page.get_by_label("Settings").click(timeout=3000)
            except:
                try:
                    # Try German "Einstellungen"
                    page.get_by_label("Einstellungen").click(timeout=3000)
                except:
                    # Try selector
                    # There are likely few .btn-icon-accent. Let's click the one that looks like settings.
                    # Or execute JS to open it: uiStore.toggleSettingsModal(true) - hard to reach store from console easily without exposing it.

                    # Search for button containing SVG
                    page.locator("button.btn-icon-accent").first.click()

            # Wait for modal content
            modal = page.locator(".modal-content")
            modal.wait_for(state="visible", timeout=5000)

            # Get bounding box
            box = modal.bounding_box()
            print(f"Viewport Width: 1920")
            print(f"Modal Width: {box['width']}")

            # 62vw of 1920 is ~1190.4
            # 90vw of 1920 is ~1728

            page.screenshot(path="verification/settings_modal_v2.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error_v2.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_settings_modal()
