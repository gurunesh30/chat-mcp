/**
 * ingestTool.ts
 *
 * Phase 2 — Ingestion pipeline
 *
 * Exposes:
 *   ingestSession(raw, formatHint?)  — programmatic entry used by fileWatcher
 *   registerIngestTool(server)       — registers the MCP tool on the server
 *
 * MCP tool: ingest_chat_session
 *   Input:  { content: string, format?: "chatgpt"|"claude"|"gemini"|"markdown" }
 *   Output: text summary of what was ingested
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { parseExportFile } from "../ingest/parser.js";
import { embedBatch } from "../embed/embedder.js";
import { upsertSession, upsertMessages } from "../db/vectorStore.js";
import type { IngestResult, MessageRow } from "../types/index.js";

// ---------------------------------------------------------------------------
// Core ingestion logic (shared by MCP tool + file watcher)
// ---------------------------------------------------------------------------

/**
 * Parse, embed, and upsert a raw chat export string into LanceDB.
 *
 * Steps:
 *  1. Detect format (or use hint) and parse into ChatSession[]
 *  2. For each session: embed all message content strings in one batch call
 *  3. Upsert session metadata row
 *  4. Upsert message rows (skipping already-indexed IDs)
 *
 * Returns an IngestResult per session processed.
 */
export async function ingestSession(
  raw: string,
  formatHint?: string
): Promise<IngestResult[]> {
  const hint = formatHint as
    | "chatgpt"
    | "claude"
    | "gemini"
    | "markdown"
    | undefined;

  const sessions = parseExportFile(raw, hint);
  const results: IngestResult[] = [];

  for (const session of sessions) {
    const errors: string[] = [];

    // --- 1. Embed all messages in one batch pass ---
    const texts = session.messages.map((m) => m.content);
    let vectors: Float32Array[];

    try {
      vectors = await embedBatch(texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Embedding failed: ${msg}`);
      results.push({
        sessionId: session.id,
        messagesIngested: 0,
        skipped: session.messages.length,
        errors,
      });
      continue;
    }

    // --- 2. Build MessageRow array ---
    const messageRows: MessageRow[] = session.messages.map((msg, i) => ({
      id: msg.id,
      sessionId: session.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      vector: vectors[i],
      metadataJson: JSON.stringify(msg.metadata ?? {}),
    }));

    // --- 3. Upsert session metadata ---
    try {
      await upsertSession(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Session upsert failed: ${msg}`);
    }

    // --- 4. Upsert messages ---
    let written = 0;
    let skipped = 0;

    try {
      written = await upsertMessages(messageRows, session.id);
      skipped = messageRows.length - written;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Message upsert failed: ${msg}`);
      skipped = messageRows.length;
    }

    results.push({
      sessionId: session.id,
      messagesIngested: written,
      skipped,
      errors,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// MCP tool registration
// ---------------------------------------------------------------------------

/** Zod schema for the ingest_chat_session tool inputs */
const IngestInputSchema = {
  content: z
    .string()
    .min(1)
    .describe(
      "Raw chat export file contents — ChatGPT conversations.json, Claude export JSON, Gemini Takeout JSON, or Markdown transcript"
    ),
  format: z
    .enum(["chatgpt", "claude", "gemini", "markdown"])
    .optional()
    .describe(
      "Optional format hint. If omitted the format is auto-detected from the content structure."
    ),
};

/**
 * Register the `ingest_chat_session` MCP tool on the server.
 *
 * Agents call this to index a chat export file directly. The tool returns a
 * plain-text summary of every session that was ingested.
 */
export function registerIngestTool(server: McpServer): void {
  server.tool(
    "ingest_chat_session",
    "Parse and index a chat export file (ChatGPT, Claude, Gemini, or Markdown) into the local vector database so its content becomes searchable via query_chat_context.",
    IngestInputSchema,
    async ({ content, format }) => {
      let results: IngestResult[];

      try {
        results = await ingestSession(content, format);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Ingestion failed: ${msg}` }],
        };
      }

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No sessions found in the provided content.",
            },
          ],
        };
      }

      const lines = results.map((r) => {
        const status = r.errors.length > 0 ? " ⚠" : " ✓";
        let line = `${status} Session ${r.sessionId}: ${r.messagesIngested} messages indexed`;
        if (r.skipped > 0) line += `, ${r.skipped} skipped (already indexed)`;
        if (r.errors.length > 0) line += `\n  Errors: ${r.errors.join("; ")}`;
        return line;
      });

      const totalIngested = results.reduce((s, r) => s + r.messagesIngested, 0);
      const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
      const summary = [
        `Processed ${results.length} session(s) — ${totalIngested} messages indexed, ${totalSkipped} skipped.`,
        "",
        ...lines,
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
      };
    }
  );
}
