from playwright.sync_api import sync_playwright
import json

def verify_orders_tooltip():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1600, 'height': 900}, # Use desktop resolution
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US'
        )
        page = context.new_page()

        mock_data = {
            "orders": [
                {
                    "orderId": "12345",
                    "id": "12345",
                    "symbol": "BTCUSDT",
                    "type": "LIMIT",
                    "side": "BUY",
                    "price": "65000",
                    "amount": "1.5",
                    "filled": "0.5",
                    "status": "PART_FILLED",
                    "time": 1700000000000,
                    "leverage": 10,
                    "marginMode": "ISOLATED",
                    "reduceOnly": False,
                    "tpPrice": "70000",
                    "slPrice": "60000",
                    "tpStopType": "MARK",
                    "slStopType": "MARK",
                    "tpOrderType": "MARKET",
                    "slOrderType": "MARKET",
                    "fee": "0.005",
                    "realizedPNL": "0.0"
                }
            ]
        }

        page.route("**/api/orders", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(mock_data)
        ))

        page.goto("http://localhost:5173")

        page.evaluate("""
            localStorage.setItem('cryptoCalculatorSettings', JSON.stringify({
                apiProvider: 'bitunix',
                showSidebars: true,
                marketDataInterval: '1m',
                apiKeys: {
                    bitunix: { key: 'dummy', secret: 'dummy' },
                    binance: { key: '', secret: '' }
                }
            }));
        """)

        page.reload()
        page.wait_for_selector("text=Market Activity", timeout=10000)
        page.click("button:has-text('Orders')")

        # Ensure it's in view
        locator = page.locator("text=BTCUSDT")
        locator.scroll_into_view_if_needed()

        # Force hover if simple hover fails
        try:
             locator.hover(force=True)
        except:
             print("Hover failed, trying dispatchEvent")
             locator.dispatch_event("mouseenter")

        page.wait_for_selector("text=Order ID: 12345", timeout=5000)
        page.screenshot(path="verification/tooltip_verification.png")
        print("Success!")

        browser.close()

if __name__ == "__main__":
    verify_orders_tooltip()
