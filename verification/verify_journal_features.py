from playwright.sync_api import sync_playwright, expect
import json
import time
import os

def verify_journal(page):
    # Mock Journal Data (2 trades for tag test)
    mock_journal = [
        {
            "id": 1,
            "date": "2023-10-28T10:00:00.000Z",
            "symbol": "BTCUSDT",
            "tradeType": "Long",
            "entryPrice": 30000,
            "stopLossPrice": 29000,
            "status": "Won",
            "totalNetProfit": 500,
            "tags": ["alpha_strat"], # Available tag
            "notes": "Note 1",
            "screenshot": None,
            "accountSize": 10000,
            "riskPercentage": 1,
            "leverage": 10,
            "fees": 0,
            "totalRR": 2,
            "riskAmount": 100,
            "totalFees": 0,
            "maxPotentialProfit": 1000,
            "targets": [],
            "calculatedTpDetails": [],
            "positionSize": "0.1234" # Test Size
        },
        {
            "id": 2,
            "date": "2023-10-27T10:00:00.000Z",
            "symbol": "ETHUSDT",
            "tradeType": "Short",
            "entryPrice": 2000,
            "stopLossPrice": 2100,
            "status": "Lost",
            "totalNetProfit": -100,
            "tags": [], # No tags
            "notes": "Note 2",
            "screenshot": None,
            "accountSize": 10000,
            "riskPercentage": 1,
            "leverage": 10,
            "fees": 0,
            "totalRR": 2,
            "riskAmount": 100,
            "totalFees": 0,
            "maxPotentialProfit": 1000,
            "targets": [],
            "calculatedTpDetails": [],
            "positionSize": "10.5" # Test Size
        }
    ]

    mock_settings = {
        "disclaimerAccepted": True,
        "isPro": True,
        "showSidebars": True
    }

    page.goto("http://localhost:5173")
    page.evaluate(f"localStorage.setItem('tradeJournal', '{json.dumps(mock_journal)}');")
    page.evaluate(f"localStorage.setItem('cryptoCalculatorSettings', '{json.dumps(mock_settings)}');")
    page.reload()

    try:
        page.get_by_label("Close Changelog").click(timeout=2000)
    except:
        pass
    try:
        page.get_by_label("Close Guide").click(timeout=2000)
    except:
        pass

    page.locator("#view-journal-btn-desktop").click()
    page.wait_for_selector(".journal-table")
    modal = page.locator(".modal-content")

    # Verify Size Column
    # First row should have 0.1234
    expect(modal.get_by_role("cell", name="0.1234").first).to_be_visible()

    # Second row should have 10.5000 (toFixed(4))
    expect(modal.get_by_role("cell", name="10.5000").first).to_be_visible()

    # Take screenshot
    page.screenshot(path="verification/journal_features.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1600, "height": 900})
        try:
            verify_journal(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
