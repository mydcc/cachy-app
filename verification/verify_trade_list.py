import time
from playwright.sync_api import sync_playwright, expect
from decimal import Decimal

def verify_trade_list(page):
    print("Navigating to app...")
    page.goto("http://localhost:5173")

    # Wait for app to load
    page.wait_for_selector(".calculator-wrapper", timeout=10000)

    # Mock settings to ensure Bitunix and Market Overview are active
    print("Injecting settings...")
    page.evaluate("""() => {
        const settings = {
            apiProvider: 'bitunix',
            marketDataInterval: '1m',
            showSidebars: true,
            disclaimerAccepted: true, // Bypass Legal Disclaimer
            apiKeys: { bitunix: { key: 'test', secret: 'test' } },
            tradeListSettings: {
                minTradeValue: 0,
                maxTradeAgeSeconds: 600,
                maxTradeCount: 10
            }
        };
        localStorage.setItem('cryptoCalculatorSettings', JSON.stringify(settings));

        // Mock Trade Store with a symbol
        const trade = {
            symbol: 'BTCUSDT',
            entryPrice: 50000,
            riskAmount: 100
        };
        localStorage.setItem('cachy_trade_store', JSON.stringify(trade));
    }""")

    page.reload()
    page.wait_for_selector(".calculator-wrapper", timeout=10000)

    # Dismiss any lingering modals just in case
    try:
        accept_btn = page.get_by_role("button", name="I understand and accept")
        if accept_btn.is_visible(timeout=2000):
            accept_btn.click()
    except:
        pass

    # Find Market Overview Tile
    print("Locating Market Overview...")
    tile = page.locator(".market-overview-card").first
    expect(tile).to_be_visible()

    # Wait for the Toggle Button "Trades"
    print("Checking for Toggle Button...")
    toggle_btn = tile.get_by_title("Switch to Trade List")
    expect(toggle_btn).to_be_visible()

    # Click Toggle to switch to Trades view
    print("Switching to Trade List...")
    toggle_btn.click()

    # Wait for trades to appear (Real WS data might take a moment)
    print("Waiting for trade data...")
    # Either "Waiting for trades..." or actual rows
    time.sleep(2)

    # Take screenshot of the list
    page.screenshot(path="verification/trade_list_real.png")
    print("Screenshot taken: Trade List")

    print("Verification complete.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            verify_trade_list(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
            raise e
        finally:
            browser.close()
