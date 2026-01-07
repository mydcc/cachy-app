
import json
from playwright.sync_api import sync_playwright, expect

def verify_account_tooltip(page):
    # Capture console logs and errors
    page.on("console", lambda msg: print(f"Console: {msg.text}"))
    page.on("pageerror", lambda err: print(f"Page Error: {err}"))

    # 1. Mock the API response for /api/account
    page.route("**/api/account", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({
            "available": 1234.56,
            "margin": 50.00,
            "marginCoin": "USDT",
            "frozen": 100.00,
            "transfer": 1084.56,
            "bonus": 10.00,
            "positionMode": "HEDGE",
            "crossUnrealizedPNL": 25.50,
            "isolationUnrealizedPNL": -5.00
        })
    ))

    # 2. Mock /api/positions
    page.route("**/api/positions", lambda route: route.fulfill(
        status=200, content_type="application/json", body=json.dumps({"positions": []})
    ))

    # 3. Inject settings with fake API keys
    settings = {
        "apiProvider": "bitunix",
        "apiKeys": {
            "bitunix": {"key": "fake_key", "secret": "fake_secret"},
            "binance": {"key": "", "secret": ""}
        },
        "showSidebars": True,
        "marketDataInterval": "1m",
        "autoUpdatePriceInput": False,
        "autoFetchBalance": True
    }

    page.add_init_script(f"""
        localStorage.setItem('cryptoCalculatorSettings', '{json.dumps(settings)}');
    """)

    # 4. Navigate to the page
    page.goto("http://localhost:5173/")

    # 5. Wait for the Account Summary to load
    print("Waiting for 'Available' text...")
    page.wait_for_selector("text=Available", timeout=10000)

    # 6. Locate the trigger element
    # The div has class "cursor-help"
    trigger = page.locator(".cursor-help").first
    print("Trigger found.")

    # 7. Force hover / mouseenter
    print("Dispatching mouseenter...")
    trigger.dispatch_event("mouseenter")
    trigger.hover(force=True)

    # 8. Wait for tooltip content to appear
    print("Waiting for tooltip content...")
    # Look for "Transferable" which is inside AccountTooltip
    expect(page.get_by_text("Transferable")).to_be_visible(timeout=5000)

    expect(page.get_by_text("Frozen")).to_be_visible()
    expect(page.get_by_text("100.00")).to_be_visible()   # Frozen value
    expect(page.get_by_text("HEDGE")).to_be_visible()    # Position Mode

    # 9. Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="/home/jules/verification/account_tooltip.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a wide viewport to ensure sidebar is visible
        context = browser.new_context(viewport={"width": 1600, "height": 900})
        page = context.new_page()
        try:
            verify_account_tooltip(page)
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="/home/jules/verification/error.png")
        finally:
            browser.close()
