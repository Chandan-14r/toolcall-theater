import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Tool } from "../base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "../../../sandbox");

if (!fs.existsSync(SANDBOX_DIR)) {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

export class BrowserTool extends Tool {
  constructor() {
    super(
      "browser",
      "Automate a web browser using Playwright to navigate to pages, click elements, fill inputs, and capture screenshots/content.",
      {
        type: "object",
        properties: {
          action: { type: "string", enum: ["navigate", "click", "fill", "content", "screenshot"] },
          url: { type: "string" },
          selector: { type: "string" },
          value: { type: "string" },
          filePath: { type: "string" }
        },
        required: ["action"]
      },
      "browser",
      15000,
      "write"
    );
    this.browser = null;
    this.page = null;
  }

  async run(input, context = {}) {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
      const ctx = await this.browser.newContext();
      this.page = await ctx.newPage();
    }

    try {
      if (input.action === "navigate") {
        if (!input.url) throw new Error("Missing 'url' parameter for navigate action.");
        await this.page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 10000 });
        return `Successfully navigated to: ${input.url}`;
      }
      
      if (input.action === "click") {
        if (!input.selector) throw new Error("Missing 'selector' parameter for click action.");
        await this.page.click(input.selector, { timeout: 5000 });
        return `Successfully clicked selector: ${input.selector}`;
      }

      if (input.action === "fill") {
        if (!input.selector) throw new Error("Missing 'selector' parameter for fill action.");
        if (input.value === undefined) throw new Error("Missing 'value' parameter for fill action.");
        await this.page.fill(input.selector, input.value, { timeout: 5000 });
        return `Successfully filled selector: ${input.selector}`;
      }

      if (input.action === "content") {
        const textContent = await this.page.evaluate(() => document.body.innerText);
        return textContent;
      }

      if (input.action === "screenshot") {
        if (!input.filePath) throw new Error("Missing 'filePath' parameter for screenshot action.");
        const safePath = path.resolve(SANDBOX_DIR, input.filePath);
        if (!safePath.startsWith(SANDBOX_DIR)) {
          throw new Error("AccessDenied: Path traversal attempt detected.");
        }
        
        // Ensure folder exists
        const dirName = path.dirname(safePath);
        if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName, { recursive: true });
        }

        await this.page.screenshot({ path: safePath });
        return `Screenshot successfully saved to ${input.filePath}`;
      }

      throw new Error(`Unsupported action: ${input.action}`);
    } catch (err) {
      throw new Error(`BrowserToolError during ${input.action}: ${err.message}`);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
