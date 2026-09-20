/**
 * searchTool.ts
 *
 * Phase 3 — Retrieval tool (task 3.2)
 *
 * Exposes:
 *   registerSearchTool(server)  — registers query_chat_context on the MCP server
 *
 * MCP tool: query_chat_context
 *   Embeds the query text, runs vector similarity search in LanceDB,
 *   and returns ranked conversation snippets with source attribution.
 *
 * Input schema:
 *   query      {string}    Natural-language search query (required)
 *   topK       {number?}   Max results (default: config.searchTopK)
 *   source     {string?}   Filter: "chatgpt" | "claude" | "gemini" | "unknown"
 *   sessionIds {string[]?} Restrict results to these session IDs
 *   fromDate   {string?}   ISO 8601 lower-bound date filter (inclusive)
 *   toDate     {string?}   ISO 8601 upper-bound date filter (inclusive)
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { config } from "../config.js";
import { embedText } from "../embed/embedder.js";
import { searchMessages } from "../db/vectorStore.js";
import type { SearchResult } from "../types/index.js";

// ---------------------------------------------------------------------------
// Programmatic search (shared by tool + any future callers)
// ---------------------------------------------------------------------------

/**
 * Embed `queryText` and run vector similarity search.
 * Thin wrapper so callers don't need to import embedder + vectorStore directly.
 */
export async function queryContext(
  queryText: string,
  topK: number = config.searchTopK,
  options: {
    source?: "chatgpt" | "claude" | "gemini" | "unknown";
    sessionIds?: string[];
    fromTimestamp?: number;
    toTimestamp?: number;
  } = {}
): Promise<SearchResult[]> {
  const queryVector = await embedText(queryText);

  return searchMessages(queryVector, {
    query: queryText,
    topK,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Result formatter
// ---------------------------------------------------------------------------

/**
 * Convert a SearchResult array into a readable Markdown string
 * suitable for returning inside an MCP tool content block.
 */
function formatResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `No results found for: "${query}"\n\nTry ingesting chat exports first using the ingest_chat_session tool.`;
  }

  const lines: string[] = [
    `Found ${results.length} result(s) for: "${query}"`,
    "",
  ];

  results.forEach((r, i) => {
    const date = new Date(r.message.timestamp).toISOString().split("T")[0];
    const score = (r.score * 100).toFixed(1);
    const role = r.message.role.toUpperCase();
    const source = r.session.source;

    lines.push(`### ${i + 1}. ${r.session.title}`);
    lines.push(`**Source:** ${source} | **Date:** ${date} | **Relevance:** ${score}%`);
    lines.push(`**Session ID:** ${r.session.id}`);
    lines.push("");
    lines.push(`**[${role}]** ${r.message.content}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// MCP tool registration
// ---------------------------------------------------------------------------

/** Zod schema for query_chat_context inputs */
const SearchInputSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      "Natural-language question or topic to search for in past conversations"
    ),
  topK: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      `Maximum number of results to return (default: ${config.searchTopK})`
    ),
  source: z
    .enum(["chatgpt", "claude", "gemini", "unknown"])
    .optional()
    .describe("Filter results to a specific chat provider"),
  sessionIds: z
    .array(z.string())
    .optional()
    .describe("Restrict results to specific session IDs"),
  fromDate: z
    .string()
    .optional()
    .describe("ISO 8601 date lower bound, e.g. 2024-01-01 (inclusive)"),
  toDate: z
    .string()
    .optional()
    .describe("ISO 8601 date upper bound, e.g. 2024-12-31 (inclusive)"),
};

/**
 * Register the `query_chat_context` tool on the MCP server.
 *
 * This is the primary tool coding agents use to retrieve relevant
 * context from indexed chat history.
 */
export function registerSearchTool(server: McpServer): void {
  server.tool(
    "query_chat_context",
    "Search past chat conversations (ChatGPT, Claude, Gemini) using natural language. Returns the most relevant message snippets with source and date attribution. Use this to recall previous architecture decisions, code discussions, or any topic from your chat history.",
    SearchInputSchema,
    async ({ query, topK, source, sessionIds, fromDate, toDate }) => {
      // Parse optional date strings → epoch ms
      let fromTimestamp: number | undefined;
      let toTimestamp: number | undefined;

      if (fromDate) {
        const d = Date.parse(fromDate);
        if (isNaN(d)) {
          return {
            isError: true,
            content: [{ type: "text", text: `Invalid fromDate: "${fromDate}". Use ISO 8601 format, e.g. 2024-01-01` }],
          };
        }
        fromTimestamp = d;
      }

      if (toDate) {
        // Include the whole end day by advancing to 23:59:59.999
        const d = Date.parse(toDate);
        if (isNaN(d)) {
          return {
            isError: true,
            content: [{ type: "text", text: `Invalid toDate: "${toDate}". Use ISO 8601 format, e.g. 2024-12-31` }],
          };
        }
        toTimestamp = d + 86_399_999;
      }

      let results: SearchResult[];
      try {
        results = await queryContext(query, topK ?? config.searchTopK, {
          source,
          sessionIds,
          fromTimestamp,
          toTimestamp,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Search failed: ${msg}` }],
        };
      }

      return {
        content: [{ type: "text", text: formatResults(results, query) }],
      };
    }
  );
}
