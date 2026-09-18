/**
 * vectorStore.ts
 *
 * Wraps the LanceDB `messages` table and exposes text/vector search methods.
 * Full implementation is Phase 3 (task 3.1).
 */

import type { SearchQuery, SearchResult } from "../types/index.js";

/**
 * Search the messages table using a natural-language query.
 *
 * Phase 3 will:
 *  - embed the query text with an embedding model
 *  - run a vector similarity search against the `vector` column
 *  - optionally apply metadata pre-filters (source, sessionIds, date range)
 *  - return ranked SearchResult objects
 *
 * @throws {Error} Not yet implemented
 */
export async function searchMessages(
  _query: SearchQuery
): Promise<SearchResult[]> {
  throw new Error("vectorStore.searchMessages — not yet implemented (Phase 3)");
}

/**
 * Retrieve the most recently updated sessions, up to `limit`.
 * Used by the `chat://sessions/latest` MCP resource (Phase 3).
 *
 * @throws {Error} Not yet implemented
 */
export async function getLatestSessions(_limit: number): Promise<unknown[]> {
  throw new Error(
    "vectorStore.getLatestSessions — not yet implemented (Phase 3)"
  );
}
