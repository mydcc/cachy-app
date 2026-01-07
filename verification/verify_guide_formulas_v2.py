import time
from playwright.sync_api import sync_playwright

def verify_guide_formulas_v2():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to see the modal clearly
        context = browser.new_context(viewport={"width": 1280, "height": 1024})
        page = context.new_page()

        page.goto("http://localhost:5173")
        page.wait_for_selector("body")

        # The footer is outside the main block.
        # <footer class="w-full max-w-4xl mx-auto text-center py-4 text-sm text-gray-500 flex justify-center items-center gap-4">
        # <button class="text-link" on:click={() => uiStore.toggleGuideModal(true)} ... >{('app.guideButton')}</button>

        # Click the "Guide" button in the footer.
        # We can be specific about the button role and name "Guide".
        page.get_by_role("button", name="Guide").click()

        # Wait for modal to open. The modal has class 'modal-content' inside 'modal-overlay'.
        # We should wait for the overlay to be visible or the content.
        # src/components/shared/ModalFrame.svelte: .modal-overlay.visible
        page.wait_for_selector(".modal-overlay.visible")

        # Wait for content to render (markdown parsing)
        # The content is injected into #guide-content
        page.wait_for_selector("#guide-content")

        # Give it a moment for KaTeX to render if it's async or just to be safe
        time.sleep(2)

        # Check for KaTeX elements
        try:
            # Check if KaTeX elements exist
            # KaTeX typically renders elements with class 'katex'
            katex_elements = page.locator(".katex")
            count = katex_elements.count()
            print(f"Found {count} KaTeX elements.")

            if count > 0:
                print("KaTeX rendering confirmed via element check.")
            else:
                print("WARNING: No KaTeX elements found.")
        except Exception as e:
            print(f"Error checking KaTeX elements: {e}")

        # Take a screenshot of the modal content, specifically the formulas section
        # The modal content has overflow-y: auto. We need to scroll inside it.

        # Locate the modal body which is scrollable
        modal_body = page.locator(".modal-body")

        # Scroll down to find formulas.
        # We can try to scroll until we see a known formula text or header.
        # "Formulas" or "Formeln"

        # Just scroll a fixed amount for now, the modal is not huge.
        # Or locate the header "Formulas" and scroll into view.

        try:
            # Scroll "Formulas" header into view if possible
            formulas_header = page.locator("#guide-content h3").filter(has_text="Formulas").first
            if formulas_header.count() == 0:
                 formulas_header = page.locator("#guide-content h3").filter(has_text="Formeln").first

            if formulas_header.count() > 0:
                formulas_header.scroll_into_view_if_needed()
                # Scroll a bit more to show content below header
                modal_body.evaluate("el => el.scrollBy(0, 200)")
            else:
                print("Could not find 'Formulas' header, scrolling manually.")
                modal_body.evaluate("el => el.scrollTop = 1000")

        except Exception as e:
            print(f"Error scrolling: {e}")
            modal_body.evaluate("el => el.scrollTop = 1000")

        time.sleep(1)
        page.screenshot(path="verification/guide_formulas_rendered.png")

        browser.close()

if __name__ == "__main__":
    verify_guide_formulas_v2()
