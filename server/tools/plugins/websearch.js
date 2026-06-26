import { Tool } from "../base.js";
import { MissingCredentialsError } from "../../providers/base.js";

export class WebSearchTool extends Tool {
  constructor() {
    super(
      "websearch",
      "Perform a real web search to retrieve relevant pages.",
      {
        type: "object",
        properties: {
          query: { type: "string" }
        },
        required: ["query"]
      },
      "websearch",
      5000,
      "read"
    );
  }

  async run(input, context = {}) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new MissingCredentialsError("Tavily Search API", "TAVILY_API_KEY");
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: input.query
      })
    });

    if (!res.ok) {
      throw new Error(`Tavily Search HTTP Error: ${res.status}`);
    }

    const data = await res.json();
    return data.results || [];
  }
}
