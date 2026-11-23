"""Start Acme Notes, click Save, print what the window shows."""
from playwright.sync_api import sync_playwright

APP = "/Applications/Acme Notes.app/Contents/MacOS/Acme Notes"

with sync_playwright() as p:
    app = p._electron.launch(executable_path=APP)
    window = app.first_window()
    window.click("text=Save")
    print(window.locator("body").inner_text())
    app.close()
