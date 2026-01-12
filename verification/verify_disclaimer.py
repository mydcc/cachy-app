import time
from playwright.sync_api import sync_playwright, expect

def verify_disclaimer(page):
    print("Navigating to app...")
    page.goto("http://localhost:5173")

    # Ensure local storage is clear for disclaimer
    page.evaluate("localStorage.removeItem('cryptoCalculatorSettings')")
    page.reload()

    print("Checking initial state (should be hidden)...")
    # Should not be visible immediately
    # We look for the disclaimer text or header
    disclaimer_header = page.get_by_text("Legal Disclaimer", exact=False)
    if disclaimer_header.is_visible():
        print("ERROR: Disclaimer visible immediately!")
    else:
        print("SUCCESS: Disclaimer hidden initially.")

    print("Waiting for 4 seconds...")
    time.sleep(4.5)

    print("Checking if disclaimer appeared...")
    # Now it should be visible
    expect(disclaimer_header).to_be_visible()

    # Verify styles (rough check via bounding box or just screenshot)
    box = disclaimer_header.bounding_box()
    if box:
        print(f"Disclaimer visible at: {box}")

    page.screenshot(path="verification/disclaimer_visible.png")

    print("Clicking Accept...")
    # Trying English text first, then German if not found
    button = page.get_by_role("button", name="I understand and accept")
    if not button.is_visible():
        button = page.get_by_role("button", name="Verstanden und akzeptiert")

    button.click()

    # Should disappear
    print("Checking if it disappears...")
    expect(disclaimer_header).not_to_be_visible()

    print("Reloading to check persistence...")
    page.reload()

    print("Waiting 4.5 seconds again...")
    time.sleep(4.5)

    if disclaimer_header.is_visible():
        print("ERROR: Disclaimer reappeared after accept!")
    else:
        print("SUCCESS: Disclaimer stayed hidden.")

    page.screenshot(path="verification/disclaimer_hidden.png")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    try:
        verify_disclaimer(page)
    except Exception as e:
        print(f"Verification failed: {e}")
        page.screenshot(path="verification/error.png")
    finally:
        browser.close()
