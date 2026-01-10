import json
from playwright.sync_api import sync_playwright

def verify_journal_pdf_button():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        )

        # Inject LocalStorage state to unlock Journal and be a Pro user
        state = {
            'cryptoCalculatorSettings': json.dumps({
                'isPro': True,
                'isDeepDiveUnlocked': True,
                'apiKeys': {},
                'favoriteTimeframes': ['15m', '1h', '4h'],
                'syncRsiTimeframe': False,
                'enableSidePanel': True,
                'sidePanelMode': 'push',
                'showTechnicals': True,
                'isTechnicalsOpen': True,
                'currentTheme': 'dark',
                'autoUpdatePriceInput': True,
                'autoFetchBalance': False,
                'showChangelogModal': False
            }),
             'cachy_trade_store': json.dumps({
                 'journalSearchQuery': '',
                 'journalFilterStatus': 'all',
            }),
            'tradeJournal': json.dumps([
                {
                    "id": 1,
                    "date": "2024-05-20T10:00:00",
                    "entryDate": "2024-05-20T10:00:00",
                    "exitDate": "2024-05-20T14:00:00",
                    "symbol": "BTCUSDT",
                    "tradeType": "long",
                    "status": "Won",
                    "entryPrice": 60000,
                    "exitPrice": 61000,
                    "quantity": 0.1,
                    "leverage": 10,
                    "fees": 5,
                    "fundingFee": 1.2,
                    "tradingFee": 5,
                    "stopLossPrice": 59000,
                    "totalRR": 2.5,
                    "totalNetProfit": 95,
                    "riskAmount": 100,
                    "totalFees": 6.2,
                    "maxPotentialProfit": 200,
                    "notes": "Test trade",
                    "targets": [],
                    "calculatedTpDetails": [],
                    "isManual": True
                }
            ])
        }

        # Add init script to set localStorage
        context.add_init_script(f"""
            Object.keys({json.dumps(state)}).forEach(key => {{
                localStorage.setItem(key, {json.dumps(state)}[key]);
            }});
        """)

        page = context.new_page()

        try:
            # Go to app
            print("Navigating to app...")
            page.goto("http://localhost:5173", timeout=60000)
            print("Page loaded.")

            # Wait for any hydration
            page.wait_for_timeout(2000)

             # Try to close any visible modal buttons (e.g., "Close", "Accept", "OK")
            for btn_text in ["Accept", "I Understand", "Close", "OK", "Verstanden", "Akzeptieren"]:
                try:
                    modal_btn = page.get_by_text(btn_text, exact=True)
                    if modal_btn.is_visible():
                        print(f"Found blocking modal button: {btn_text}, clicking...")
                        modal_btn.click()
                        page.wait_for_timeout(1000)
                except:
                    pass

             # Also check for disclaimer modal specifically if known
            disclaimer_btn = page.query_selector("button:has-text('I Understand')")
            if disclaimer_btn and disclaimer_btn.is_visible():
                 print("Clicking disclaimer...")
                 disclaimer_btn.click()
                 page.wait_for_timeout(1000)

            # Click Journal Button (desktop ID)
            print("Clicking Journal button...")
            page.click("#view-journal-btn-desktop", timeout=10000, force=True)

            # Wait for modal to open
            print("Waiting for modal...")
            page.wait_for_selector(".modal-content", state="visible", timeout=10000)

            # Scroll to bottom of modal-body
            print("Scrolling to bottom of modal...")
            page.evaluate("document.querySelector('.modal-body').scrollTop = document.querySelector('.modal-body').scrollHeight")
            page.wait_for_timeout(1000)

            # Look for the PDF Export button
            print("Looking for PDF button...")
            export_btn = page.query_selector("#export-pdf-btn")

            if export_btn:
                print("Export PDF button found!")
                modal = page.query_selector(".modal-content")
                modal.screenshot(path="verification/journal_modal_with_pdf_btn.png")
                print("Screenshot saved to verification/journal_modal_with_pdf_btn.png")
            else:
                print("Export PDF button NOT found!")
                page.screenshot(path="verification/journal_modal_failed.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_journal_pdf_button()
