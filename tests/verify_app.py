import subprocess
import time
import json
import os
from playwright.sync_api import sync_playwright

def run_verification():
    # Start the Node server (serves public/ as static root + API endpoints)
    print("Starting Node server...")
    server_env = os.environ.copy()
    server_env["PROVIDER"] = "dummy"
    server_env["NODE_ENV"] = "test"
    server_process = subprocess.Popen(
        ["node", "server/index.js"],
        cwd="C:/Users/crs14/.gemini/antigravity/scratch/toolcall-theater",
        env=server_env
    )
    time.sleep(2.5)  # Wait for server to bind

    try:
        with sync_playwright() as p:
            print("Launching headless Chromium...")
            try:
                browser = p.chromium.launch(headless=True)
            except Exception as e:
                print(f"Failed to launch chromium: {e}")
                print("Attempting to run 'playwright install chromium'...")
                subprocess.run(["playwright", "install", "chromium"], check=True)
                browser = p.chromium.launch(headless=True)

            page = browser.new_page()
            page.set_viewport_size({"width": 1280, "height": 800})

            console_logs = []
            page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

            # Navigate
            print("Navigating to http://localhost:8080...")
            response = page.goto("http://localhost:8080")
            print(f"Page load response status: {response.status}")
            time.sleep(1.0)  # Let JS init + fetch scenarios

            # Verify page loads with scenario title
            title = page.locator("#scenario-title").text_content()
            print(f"Scenario title on load: '{title}'")
            assert title and len(title) > 0, "Scenario title should be populated"

            # Scenario switching
            print("Clicking Scenario 2 button...")
            page.locator("button.scenario:has-text('Recover a failed export')").click()
            time.sleep(0.5)
            title2 = page.locator("#scenario-title").text_content()
            print(f"Scenario title after switch: '{title2}'")
            assert title2 != title, "Scenario title should change after switching"

            # Switch back to Scenario 1
            print("Switching back to Scenario 1...")
            page.locator("button.scenario:has-text('Vendor brief with sources')").click()
            time.sleep(0.5)

            # Click Play (starts a live run via SSE)
            print("Clicking 'Play'...")
            page.locator("#play").click()

            # Wait for events to appear in timeline (dummy provider is fast)
            print("Waiting for timeline events...")
            time.sleep(3.0)

            trace_count = page.locator(".event").count()
            print(f"Trace events visible: {trace_count}")

            status_text = page.locator("#status-text").text_content()
            print(f"Status after run: '{status_text}'")

            # Click Restart
            print("Clicking 'Restart'...")
            page.locator("#restart").click()
            time.sleep(0.5)
            status_text3 = page.locator("#status-text").text_content()
            print(f"Status after restart: '{status_text3}'")
            trace_count_restart = page.locator(".event").count()
            print(f"Trace events visible after restart: {trace_count_restart}")
            assert trace_count_restart == 0, "Timeline should be empty after restart"

            # Click Export
            print("Clicking 'Export'...")
            with page.expect_download() as download_info:
                page.locator("#export").click()
            download = download_info.value
            print(f"Download triggered: {download.suggested_filename}")
            download_path = os.path.join("C:/Users/crs14/.gemini/antigravity/scratch/toolcall-theater", download.suggested_filename)
            download.save_as(download_path)

            with open(download_path, "r") as f:
                export_content = json.load(f)
                print(f"Exported JSON keys: {list(export_content.keys())}")

            # Capture screenshot
            screenshot_path = "C:/Users/crs14/.gemini/antigravity/brain/f060ee5d-0c14-49dd-8f31-1c70954a6250/demo_approval.png"
            page.screenshot(path=screenshot_path)
            print(f"Screenshot captured at {screenshot_path}")

            print("\n--- Console Logs ---")
            if not console_logs:
                print("No console logs captured.")
            for log in console_logs:
                print(log)

            browser.close()
            print("\nAll verify_app checks passed!")

    finally:
        server_process.terminate()
        server_process.wait()
        print("Server terminated.")

if __name__ == "__main__":
    run_verification()
