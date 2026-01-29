from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:5173")
            page.wait_for_timeout(5000)
            page.screenshot(path="verification/final.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
