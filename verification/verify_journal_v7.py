from playwright.sync_api import sync_playwright, expect
import time

def verify_journal_columns():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        # Set viewport large enough to see the modal
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        print("Navigating to app...")
        try:
            page.goto("http://localhost:5173", timeout=30000)
        except Exception as e:
            print(f"Failed to load page: {e}")
            return

        # Inject a dummy trade into localStorage so the journal is not empty
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
            "notes": "Test Trade"
        }]
        """

        print("Injecting test data...")
        page.evaluate(f"localStorage.setItem('cachy_trade_store', JSON.stringify({dummy_trade}))")
        page.reload()

        # Wait for app to load
        page.wait_for_load_state("networkidle")

        # Open Journal Modal
        print("Opening Journal...")
        # Try finding the journal button. It might be an icon button.
        # Based on previous knowledge, it has id "view-journal-btn-desktop" or similar.
        # Or I can try to find it by title "Trade Journal" or aria-label.

        try:
            # Try specific ID first if known, else fallback
            btn = page.locator("#view-journal-btn-desktop")
            if btn.is_visible():
                btn.click()
            else:
                # Try finding by text or title
                page.get_by_role("button", name="Journal").click()
        except:
             print("Could not find Journal button easily. Trying to force state...")
             # Force open via store might be hard from outside.
             # Let's assume the button exists.
             page.get_by_label("Open Trade Journal").click()

        time.sleep(1) # Animation

        # Check for "Advanced Metrics" checkbox
        print("Checking for Advanced Metrics checkbox...")
        checkbox = page.get_by_role("checkbox", name="Advanced Metrics")

        if not checkbox.is_visible():
             # Try German
             checkbox = page.get_by_role("checkbox", name="Erweiterte Metriken")

        if checkbox.is_visible():
            print("Checkbox found!")
            checkbox.check()
            time.sleep(0.5)

            # Take screenshot of the table
            print("Taking screenshot...")
            page.screenshot(path="verification/journal_advanced_metrics.png")
            print("Screenshot saved to verification/journal_advanced_metrics.png")

            # Verify columns exist by text
            content = page.content()
            if "Exit" in content and "Size" in content and "MAE" in content:
                print("Columns found in DOM!")
            else:
                print("Columns NOT found in DOM (or text mismatch).")
        else:
            print("Checkbox NOT found.")
            page.screenshot(path="verification/journal_failed_to_find_checkbox.png")

        browser.close()

if __name__ == "__main__":
    verify_journal_columns()
