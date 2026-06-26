import subprocess
import time
import json
import os
from playwright.sync_api import sync_playwright

def run_verification():
    # Start local server
    print("Starting local HTTP server...")
    server_process = subprocess.Popen(
        ["python", "-m", "http.server", "8080"],
        cwd="C:/Users/crs14/.gemini/antigravity/scratch/toolcall-theater"
    )
    time.sleep(2.0)  # Wait for server to bind

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
            
            console_logs = []
            page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
            
            network_requests = []
            page.on("request", lambda req: network_requests.append(f"REQ: {req.method} {req.url}"))
            page.on("response", lambda res: network_requests.append(f"RES: {res.status} {res.url}"))

            # Navigate
            print("Navigating to http://localhost:8080...")
            response = page.goto("http://localhost:8080")
            print(f"Page load response status: {response.status}")
            
            # Verify page loads
            title = page.locator("#scenario-title").text_content()
            print(f"Scenario title on load: '{title}'")
            
            # Scenario switching
            print("Clicking Scenario 2 button...")
            page.locator("button.scenario:has-text('Recover a failed export')").click()
            time.sleep(0.5)
            title2 = page.locator("#scenario-title").text_content()
            print(f"Scenario title after switch: '{title2}'")
            
            # Switch back to Scenario 1
            print("Switching back to Scenario 1...")
            page.locator("button.scenario:has-text('Vendor brief with sources')").click()
            time.sleep(0.5)
            
            # Click Step
            print("Clicking 'Step'...")
            page.locator("#step").click()
            time.sleep(0.5)
            trace_count = page.locator(".event").count()
            print(f"Trace events visible after 1 step: {trace_count}")
            
            # Click Play
            print("Clicking 'Play'...")
            page.locator("#play").click()
            
            # Wait for approval gate to appear (up to 5s)
            print("Waiting for approval gate...")
            approval_gate = page.locator(".approval-gate")
            approval_gate.wait_for(timeout=5000)
            status_text = page.locator("#status-text").text_content()
            print(f"Status after reaching checkpoint: '{status_text}'")
            
            # Click Approve action
            print("Clicking 'Approve action'...")
            page.locator(".approval-gate .approve").click()
            time.sleep(0.5)
            
            # Verify status changes
            status_text2 = page.locator("#status-text").text_content()
            print(f"Status after approval: '{status_text2}'")
            
            # Click Restart
            print("Clicking 'Restart'...")
            page.locator("#restart").click()
            time.sleep(0.5)
            status_text3 = page.locator("#status-text").text_content()
            print(f"Status after restart: '{status_text3}'")
            trace_count_restart = page.locator(".event").count()
            print(f"Trace events visible after restart: {trace_count_restart}")
            
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
                
            print("\n--- Console Logs ---")
            if not console_logs:
                print("No console logs captured.")
            for log in console_logs:
                print(log)
                
            print("\n--- Network Requests ---")
            for req in network_requests:
                print(req)
                
            browser.close()

    finally:
        server_process.terminate()
        server_process.wait()
        print("Server terminated.")

if __name__ == "__main__":
    run_verification()
