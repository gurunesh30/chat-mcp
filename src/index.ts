/**
 * index.ts — MCP Chat Memory Server entry point
 *
 * Boot sequence:
 *  1. Validate env config
 *  2. Initialise LanceDB (create tables if absent)
 *  3. Warm up embedding model (downloads weights on first run)
 *  4. Register MCP tools (ingest_chat_session, query_chat_context)
 *  5. Register MCP resources (chat://sessions/latest, chat://session/:id)
 *  6. Connect StdioServerTransport
 *  7. Start file watcher on ./exports
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { config } from "./config.js";
import { getDbClient, closeDbClient } from "./db/client.js";
import { warmupEmbedder } from "./embed/embedder.js";
import { registerIngestTool } from "./tools/ingestTool.js";
import { registerSearchTool } from "./tools/searchTool.js";
import { startFileWatcher } from "./ingest/fileWatcher.js";
import type { WatcherHandle } from "./ingest/fileWatcher.js";
import { registerSessionResources } from "./resources/sessionResources.js";

// ---------------------------------------------------------------------------
// Server metadata
// ---------------------------------------------------------------------------

const SERVER_NAME = "chat-mcp";
const SERVER_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Logger — always writes to stderr, never the MCP stdio channel
// ---------------------------------------------------------------------------

function log(level: "info" | "warn" | "error", message: string): void {
  const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const configured = levels[config.logLevel] ?? 1;
  if ((levels[level] ?? 1) >= configured) {
    process.stderr.write(`[chat-mcp] [${level.toUpperCase()}] ${message}\n`);
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function registerShutdownHandlers(
  server: McpServer,
  watcher: WatcherHandle | null
): void {
  const shutdown = async (signal: string) => {
    log("info", `Received ${signal} — shutting down`);
    try {
      if (watcher) await watcher.stop();
      await server.close();
    } finally {
      closeDbClient();
      process.exit(0);
    }
  };

  process.on("SIGINT",  () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// ---------------------------------------------------------------------------
// Tool registration (Phase 2 complete, Phase 3 stubs wired in next commit)
// ---------------------------------------------------------------------------

function registerTools(server: McpServer): void {
  registerIngestTool(server);
  registerSearchTool(server);
}

// ---------------------------------------------------------------------------
// Resource registration (Phase 3 — wired in next Phase 3 commit)
// ---------------------------------------------------------------------------

function registerResources(server: McpServer): void {
  registerSessionResources(server);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("info", `Starting ${SERVER_NAME} v${SERVER_VERSION}`);
  log("info", `LanceDB path    : ${config.lancedbPath}`);
  log("info", `Exports dir     : ${config.exportsDir}`);
  log("info", `Embedding model : ${config.embeddingModel}`);
  log("info", `Vector dims     : ${config.vectorDimensions}`);
  log("info", `Log level       : ${config.logLevel}`);

  // 1. Initialise LanceDB
  log("info", "Initialising LanceDB...");
  await getDbClient();
  log("info", "LanceDB ready");

  // 2. Warm up the embedding model so the first ingest isn't slow
  log("info", "Loading embedding model (first run downloads weights)...");
  await warmupEmbedder();
  log("info", "Embedding model ready");

  // 3. Create MCP server
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // 4. Register tools and resources
  registerTools(server);
  registerResources(server);

  // 5. Connect stdio transport BEFORE starting the file watcher so the
  //    server is ready to accept requests while the initial scan runs.
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "Server connected — listening on stdio");

  // 6. Start file watcher (non-blocking after initial ready event)
  let watcher: WatcherHandle | null = null;
  try {
    watcher = await startFileWatcher(config.exportsDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("warn", `File watcher failed to start: ${msg} — continuing without watcher`);
  }

  // 7. Register shutdown handlers with watcher reference
  registerShutdownHandlers(server, watcher);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[chat-mcp] [ERROR] Fatal: ${message}\n`);
  process.exit(1);
});
