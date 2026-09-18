/**
 * searchTool.ts
 *
 * Registers the `query_chat_context` MCP tool backed by vectorStore search.
 * Full implementation is Phase 3 (task 3.2).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SearchResult } from "../types/index.js";

/**
 * Execute a search against ingested chat history.
 *
 * Phase 3 will:
 *  - validate the query with SearchQuerySchema
 *  - delegate to vectorStore.searchMessages()
 *  - format results for MCP tool response content
 *
 * @throws {Error} Not yet implemented
 */
export async function queryContext(
  _query: string,
  _topK?: number
): Promise<SearchResult[]> {
  throw new Error("searchTool.queryContext — not yet implemented (Phase 3)");
}

/**
 * Register the `query_chat_context` tool on the provided MCP server.
 *
 * Tool input schema (Phase 3):
 *  - `query`      {string}   Natural-language search query
 *  - `topK`       {number?}  Max results (default: config.searchTopK)
 *  - `source`     {string?}  Filter by provider: chatgpt | claude | gemini
 *  - `sessionIds` {string[]?} Restrict to specific sessions
 *
 * @throws {Error} Not yet implemented
 */
export function registerSearchTool(_server: McpServer): void {
  throw new Error(
    "searchTool.registerSearchTool — not yet implemented (Phase 3)"
  );
}
