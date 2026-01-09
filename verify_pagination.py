from playwright.sync_api import sync_playwright

def verify_journal_pagination():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Create dummy data
        journal_data = []
        for i in range(50):
            journal_data.append({
                "id": 1000 + i,
                "tradeId": f"TRADE-{i}",
                "date": "2023-01-01T12:00:00.000Z",
                "symbol": f"BTCUSDT-{i}",
                "tradeType": "long",
                "status": "Won",
                "entryPrice": "50000",
                "stopLossPrice": "49000",
                "totalRR": "2",
                "totalNetProfit": "100",
                "notes": f"Trade {i}",
                "targets": [],
                "isManual": True
            })

        print("Navigating to home...")
        page.goto("http://localhost:5173")
        page.wait_for_load_state("networkidle")

        print("Injecting data...")
        # Inject localStorage and reload using the correct key 'tradeJournal'
        page.evaluate(f"""() => {{
            localStorage.setItem('tradeJournal', JSON.stringify({str(journal_data).replace("'", '"').replace('True', 'true').replace('False', 'false')}));
            window.location.reload();
        }}""")

        # Wait for reload
        page.wait_for_load_state("networkidle")
        print("Page reloaded.")

        # Open Journal Modal
        print("Clicking Journal button...")
        page.wait_for_selector("#view-journal-btn-desktop", state="visible")
        page.click("#view-journal-btn-desktop")

        # Wait for modal content
        print("Waiting for modal...")
        page.wait_for_selector("table.journal-table", state="visible", timeout=10000)

        # Verify pagination exists
        print("Checking pagination...")
        content = page.content()
        if "Page 1 of" in content:
            print("Verified: Page 1 is visible")
        else:
            print("Error: Pagination not found")

        # Click Next
        print("Clicking Next...")
        next_btn = page.get_by_role("button", name="Next >")
        if next_btn.is_visible():
            next_btn.click()
            page.wait_for_timeout(1000)
            content = page.content()
            if "Page 2 of" in content:
                print("Verified: Successfully navigated to Page 2")
            else:
                print("Error: Failed to navigate to Page 2")
        else:
            print("Error: Next button not found")

        page.screenshot(path="verification_journal_p2.png")
        print("Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    verify_journal_pagination()
