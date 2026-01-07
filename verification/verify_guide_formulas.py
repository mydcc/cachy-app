import time
from playwright.sync_api import sync_playwright

def verify_guide_formulas():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to see the modal clearly
        context = browser.new_context(viewport={"width": 1280, "height": 1024})
        page = context.new_page()

        page.goto("http://localhost:5173")
        page.wait_for_selector("body")

        # Find the Guide link in the footer and click it
        # The screenshot showed "Guide" in the footer.
        page.get_by_text("Guide", exact=True).click()

        # Wait for modal to open. The modal usually has a class like 'modal-content' or similar.
        # Based on 'src/app.css': .modal-content
        page.wait_for_selector(".modal-content")

        # Give it a moment to render markdown
        time.sleep(2)

        # Scroll down to find formulas.
        # The formulas are likely under "Formulas" or "Formeln" header.
        # Let's try to locate an element that should have KaTeX rendered.
        # We can look for the 'katex' class which is added by the library.

        try:
            # Check if KaTeX elements exist
            katex_elements = page.locator(".katex")
            count = katex_elements.count()
            print(f"Found {count} KaTeX elements.")
        except:
            print("No KaTeX elements found via locator.")

        # Take a screenshot of the modal content, specifically the formulas section
        # We can try to scroll the modal content.
        # .modal-content has overflow-y: auto

        # focus the modal
        page.locator(".modal-content").focus()

        # Scroll down arbitrary amount to hopefully show formulas
        page.evaluate("document.querySelector('.modal-content').scrollTop = 800")
        time.sleep(1)
        page.screenshot(path="verification/guide_formulas_scrolled.png")

        # Take full screenshot
        page.screenshot(path="verification/guide_full_page.png")

        browser.close()

if __name__ == "__main__":
    verify_guide_formulas()
