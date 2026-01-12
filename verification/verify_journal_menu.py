from playwright.sync_api import sync_playwright
import time

def verify_journal_settings_menu():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        print("Navigating to app...")
        try:
            page.goto("http://localhost:5173", timeout=30000)
        except Exception as e:
            print(f"Failed to load page: {e}")
            return

        # Inject dummy data
        dummy_trade = """
        [{
            "id": 123,
            "date": "2023-10-27T10:00:00.000Z",
            "entryDate": "2023-10-27T08:00:00.000Z",
            "symbol": "BTCUSDT",
            "tradeType": "Long",
            "status": "Won",
            "entryPrice": 30000,
            "stopLossPrice": 29000,
            "totalNetProfit": 500,
            "fundingFee": 0,
            "totalRR": 2.5,
            "isManual": true,
            "tags": [],
            "notes": "Test Trade",
            "screenshot": "https://example.com/image.png"
        }]
        """
        page.evaluate(f"localStorage.setItem('cachy_trade_store', JSON.stringify({dummy_trade}))")
        page.reload()
        page.wait_for_load_state("networkidle")

        # Open Journal
        print("Opening Journal...")
        try:
            btn = page.locator("#view-journal-btn-desktop")
            if btn.is_visible():
                btn.click()
            else:
                page.get_by_role("button", name="Journal").click()
        except:
             page.get_by_label("Open Trade Journal").click()

        time.sleep(1)

        # 1. Check for Correct Translation on Toolbar
        print("Checking Toolbar Labels...")
        # 'Advanced Metrics' should be visible directly
        adv_metrics_label = page.get_by_text("Advanced Metrics").first
        if adv_metrics_label.is_visible():
            print("PASS: 'Advanced Metrics' label found (translation fixed).")
        else:
            print("FAIL: 'Advanced Metrics' label NOT found.")

        # 2. Check Gear Icon and Menu
        print("Checking Gear Icon...")
        settings_btn = page.locator("button[title='Settings']") # or 'Einstellungen'
        if not settings_btn.is_visible():
             # Try generic selector if title translation failed or unknown
             settings_btn = page.locator(".journal-table-settings-btn") # I didn't add a class, so finding by icon html is hard.
             # But I added title={$_('settings.title')}. Default 'Settings' or 'Einstellungen'.
             settings_btn = page.get_by_title("Settings")
             if not settings_btn.is_visible():
                 settings_btn = page.get_by_title("Einstellungen")

        if settings_btn.is_visible():
            print("Gear icon found. Clicking...")
            settings_btn.click()
            time.sleep(0.5)

            # Check for Menu Content
            print("Checking Menu Content...")
            menu = page.locator("text=Table Settings") # Header
            if not menu.is_visible():
                 menu = page.locator("text=Tabelleneinstellungen")

            if menu.is_visible():
                print("PASS: Settings Menu opened.")

                # Check for Show Screenshots toggle
                screenshot_toggle = page.get_by_text("Show Screenshots")
                if not screenshot_toggle.is_visible():
                    screenshot_toggle = page.get_by_text("Screenshots anzeigen")

                if screenshot_toggle.is_visible():
                    print("PASS: 'Show Screenshots' option found.")
                    # Toggle it off
                    screenshot_toggle.click()
                    time.sleep(0.5)

                    # Verify column gone?
                    # The table header "Screenshot" should disappear
                    header = page.get_by_role("cell", name="Screenshot")
                    if not header.is_visible():
                        print("PASS: Screenshot column hidden.")
                    else:
                        print("FAIL: Screenshot column still visible.")

                else:
                    print("FAIL: 'Show Screenshots' option NOT found.")
            else:
                print("FAIL: Settings Menu did NOT open.")

            page.screenshot(path="verification/journal_settings_menu.png")
            print("Screenshot saved.")
        else:
            print("FAIL: Gear icon button NOT found.")

        browser.close()

if __name__ == "__main__":
    verify_journal_settings_menu()
