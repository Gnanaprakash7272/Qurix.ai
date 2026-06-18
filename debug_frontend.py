from playwright.sync_api import sync_playwright

def get_console_errors():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(str(err)))
        
        try:
            page.goto("http://localhost:5173", wait_until="networkidle", timeout=5000)
        except Exception as e:
            pass
            
        print("--- CONSOLE ERRORS ---")
        for err in errors:
            print(err)
        print("----------------------")
        browser.close()

if __name__ == "__main__":
    get_console_errors()
