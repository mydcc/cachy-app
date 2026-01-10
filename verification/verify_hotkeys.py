from playwright.sync_api import sync_playwright
import json

def verify_settings(page):
    # 0. Pre-seed localStorage to bypass Disclaimer
    page.goto('http://localhost:5173')

    # Define settings with disclaimer accepted
    settings = {
        "disclaimerAccepted": True,
        "hotkeyMode": "mode2"
    }

    # Inject into localStorage
    page.evaluate(f"localStorage.setItem('cryptoCalculatorSettings', '{json.dumps(settings)}');")
    page.reload()

    # 1. Open Settings
    # Use a more generic selector for the settings button if role/name fails
    # It might be an SVG icon without a clear accessible name initially
    page.wait_for_selector('button[title="Settings"]', state='visible')
    page.click('button[title="Settings"]')

    # 2. Click Behavior Tab
    page.get_by_role('tab', name='Behavior').click()
    page.wait_for_timeout(500) # Give UI time to render tab content

    # Take debugging screenshot
    page.screenshot(path='verification/debug_behavior_tab.png')

    # 3. Verify Hotkey Config Section exists
    if not page.get_by_text('Hotkey Configuration').is_visible():
        print('Hotkey Configuration header not found.')
        raise AssertionError('Hotkey Configuration header not found')

    # 4. Verify Preset Dropdown exists
    assert page.get_by_text('Load Preset').is_visible()

    # 5. Verify at least one action button (e.g. Load Favorite 1)
    assert page.get_by_text('Load Favorite 1').is_visible()

    # 6. Take Screenshot
    page.screenshot(path='verification/settings_hotkeys.png')

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    try:
        verify_settings(page)
    except Exception as e:
        print(e)
        page.screenshot(path='verification/error.png')
        raise e
    finally:
        browser.close()
