import time

from playwright.sync_api import sync_playwright

URL = "http://localhost:3000/dashboard"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(URL)

    messages = []
    page.on("console", lambda m: messages.append(f"{m.type}: {m.text}"))

    time.sleep(2)
    page.screenshot(path="dashboard.png")
    print("console:", messages)
    print(page.accessibility.snapshot())
    browser.close()
