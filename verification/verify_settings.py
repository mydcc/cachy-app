
import os
from playwright.sync_api import sync_playwright, expect

def verify_settings_modal(page):
    print("Navigating to app...")
    page.goto("http://localhost:5173", timeout=30000)

    print("Looking for Settings button...")
    # The button has aria-label="Settings" (or localized).
    # Since I don't know the locale for sure, I'll try looking for the SVG or just get by role button.
    # The button title is also localized.
    # Let's try to find it by the SVG path or class 'btn-icon-accent' if possible, or just look for a button near the top right.
    # Actually, the button has `aria-label={$_('settings.title')}`. Default is 'Settings'.

    # Try generic selector for the settings button. It's likely in the header.
    # Let's check if we can click it by aria-label "Settings".
    try:
        settings_btn = page.get_by_label("Settings")
        if settings_btn.count() == 0:
            # Maybe localized?
            # Try to find button with svg child with specific path d?
            settings_btn = page.locator("button.btn-icon-accent:has(svg)")
            # There might be multiple. The settings button is usually distinct.
            # Let's pick the last one or investigate?
            # Or just wait for load.
    except:
        pass

    # Let's assume English default or try to find it.
    # We can also use evaluate to find it.

    # Click settings button
    # If standard locator fails, try a CSS selector targeting the component structure if known.
    # But `aria-label` should work if text is "Settings".

    # Fallback: click the button that looks like a gear.
    page.click("button[title='Settings']", timeout=5000)

    print("Waiting for modal to appear...")
    modal_content = page.locator(".modal-content")
    expect(modal_content).to_be_visible()

    # Take screenshot of the "General" tab
    print("Taking screenshot of General tab...")
    page.screenshot(path="verification/settings_general.png")

    # Switch to "Behavior" tab to see if height is stable
    print("Switching to Behavior tab...")
    page.get_by_text("Behavior").click()
    page.wait_for_timeout(500) # Wait for potential transition
    page.screenshot(path="verification/settings_behavior.png")

    # Get dimensions
    box = modal_content.bounding_box()
    print(f"Modal dimensions: {box['width']}x{box['height']}")

    # Verify dimensions
    # We expect width to be approx 512px (max-w-lg) if on desktop.
    # We expect height to be >= 600px.

    if box['width'] > 510 and box['width'] < 515:
        print("Width check passed (approx 512px)")
    else:
        print(f"Width check warning: {box['width']}")

    if box['height'] >= 600:
        print("Height check passed (>= 600px)")
    else:
        print(f"Height check warning: {box['height']}")


if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a desktop viewport
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        try:
            verify_settings_modal(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
