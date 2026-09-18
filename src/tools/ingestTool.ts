/**
 * ingestTool.ts
 *
 * Registers the `ingest_chat_session` MCP tool and connects it to the
 * LanceDB insertion pipeline.
 * Full implementation is Phase 2 (task 2.2).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IngestResult } from "../types/index.js";

/**
 * Programmatically ingest a single chat session into LanceDB.
 *
 * Phase 2 will:
 *  - accept a raw export string + optional format hint
 *  - call parseExportFile() to normalise into ChatSession objects
 *  - generate embeddings for each ChatMessage content string
 *  - write MessageRow and SessionRow records to LanceDB
 *  - return an IngestResult summary
 *
 * @throws {Error} Not yet implemented
 */
export async function ingestSession(
  _raw: string,
  _formatHint?: string
): Promise<IngestResult> {
  throw new Error("ingestTool.ingestSession — not yet implemented (Phase 2)");
}

/**
 * Register the `ingest_chat_session` tool on the provided MCP server.
 *
 * Tool input schema (Phase 2):
 *  - `content`   {string}  Raw export file contents (JSON or Markdown)
 *  - `format`    {string?} Optional format hint: chatgpt | claude | gemini | markdown
 *
 * @throws {Error} Not yet implemented
 */
export function registerIngestTool(_server: McpServer): void {
  throw new Error(
    "ingestTool.registerIngestTool — not yet implemented (Phase 2)"
  );
}
