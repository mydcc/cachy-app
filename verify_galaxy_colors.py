
import os
import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: console_errors.append(str(exc)))

        try:
            print("Navigating to home...")
            page.goto("http://localhost:5173")
            page.wait_for_selector("body", state="attached")

            print("Opening Settings...")
            # Click settings cog
            page.locator("button[aria-label='Settings']").click()

            # Click "Design" (Visuals) tab
            print("Selecting Visuals tab...")
            page.get_by_text("Design", exact=True).click()

            # Select "Hintergrund" (Background) sub-tab
            print("Selecting Background sub-tab...")
            page.get_by_text("Hintergrund", exact=True).click()

            # Select "Galaxy (3D)"
            print("Activating Galaxy background...")
            page.get_by_role("button", name="Galaxy (3D)").click()

            # Wait for canvas to appear
            page.wait_for_selector("canvas", timeout=5000)
            print("Galaxy canvas detected.")

            time.sleep(1) # Let it render a few frames

            # Take screenshot - Default Theme
            page.screenshot(path="galaxy_multi_default.png")
            print("Screenshot: galaxy_multi_default.png")

            # Switch to Light Theme (using the theme switcher in settings if available, or just JS)
            # Assuming there is a theme switcher in settings -> Visuals -> General/Theme
            # But let's cheat and set class on html
            print("Switching to Light Theme...")
            page.evaluate("document.documentElement.className = 'theme-light'")
            time.sleep(1)
            page.screenshot(path="galaxy_multi_light.png")
            print("Screenshot: galaxy_multi_light.png")

            print("Switching to Steel Theme...")
            page.evaluate("document.documentElement.className = 'theme-steel'")
            time.sleep(1)
            page.screenshot(path="galaxy_multi_steel.png")
            print("Screenshot: galaxy_multi_steel.png")

            print("Switching to Meteorite Theme...")
            page.evaluate("document.documentElement.className = 'theme-meteorite'")
            time.sleep(1)
            page.screenshot(path="galaxy_multi_meteorite.png")
            print("Screenshot: galaxy_multi_meteorite.png")

            if console_errors:
                print("--- Console Errors ---")
                for err in console_errors:
                    print(err)
                print("----------------------")
                # Filter out known non-critical errors if any
                critical_errors = [e for e in console_errors if "Shader" in e or "WebGL" in e or "three" in e.lower()]
                if critical_errors:
                    raise Exception(f"Critical WebGL/Three.js errors detected: {critical_errors}")

            print("Verification successful!")

        except Exception as e:
            print(f"Test failed: {e}")
            if console_errors:
                print("Console errors:", console_errors)
            page.screenshot(path="error_state.png")
            exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    run()
