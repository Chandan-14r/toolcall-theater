import subprocess
import time
import json
import os
import urllib.request
from playwright.sync_api import sync_playwright

def verify_live():
    print("Starting Node live agent server (dummy provider for fast tests)...")
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
        # Test 1: Direct API Verification for Retry Exhaustion (Failure Path)
        print("Test 1: Querying POST /api/runs with forceFailure=true...")
        req = urllib.request.Request(
            "http://localhost:8080/api/runs",
            data=json.dumps({"scenarioId": "research", "forceFailure": True}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        res = urllib.request.urlopen(req)
        run_data = json.loads(res.read().decode("utf-8"))
        run_id = run_data["runId"]
        print(f"Created failed test run: {run_id}")

        # Wait for backend loop to run and persist the failure
        time.sleep(2.0)
        
        # Check run status via API
        res_run = urllib.request.urlopen(f"http://localhost:8080/api/runs/{run_id}")
        run_state = json.loads(res_run.read().decode("utf-8"))
        print(f"Run status from API: {run_state['status']}")
        assert run_state["status"] == "failed", "Status should be failed under retry exhaustion"

        # Test 2: Playwright UI Verification for Retry Recovery (Success Path)
        with sync_playwright() as p:
            print("\nTest 2: Launching headless Chromium for UI verification...")
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_viewport_size({"width": 1280, "height": 800})

            console_logs = []
            page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

            print("Navigating to http://localhost:8080...")
            page.goto("http://localhost:8080")
            time.sleep(1.0)

            # Click "Start Live Run"
            print("Clicking Start Live Run...")
            page.locator("#play").click()

            # Wait for agent execution to succeed (dummy provider is fast, ~2s)
            print("Waiting for agent execution to complete successfully...")
            time.sleep(4.0)  # Give dummy coordinator time to complete

            # Capture screenshot showing the success timeline
            screenshot_path = "C:/Users/crs14/.gemini/antigravity/brain/f060ee5d-0c14-49dd-8f31-1c70954a6250/phase1_live_run.png"
            page.screenshot(path=screenshot_path)
            print(f"Captured screenshot at {screenshot_path}")

            status_locator = page.locator("#status-text")
            final_status = status_locator.text_content()
            print(f"Final UI Run Status: '{final_status}'")
            assert final_status == "succeeded", f"Expected succeeded but got '{final_status}'"

            events_count = page.locator(".event").count()
            print(f"Number of live events rendered in timeline: {events_count}")
            assert events_count >= 3, f"Timeline should show step attempts, got {events_count}"

            print("\n--- Console Logs ---")
            if not console_logs:
                print("No console logs captured.")
            for log in console_logs:
                print(log)

            browser.close()
            print("\nAll verify_live_runtime checks passed!")

    finally:
        server_process.terminate()
        server_process.wait()
        print("Server terminated.")

if __name__ == "__main__":
    verify_live()
