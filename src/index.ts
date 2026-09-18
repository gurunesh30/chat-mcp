/**
 * index.ts — MCP Chat Memory Server entry point
 *
 * Wires together:
 *  - McpServer (high-level MCP abstraction)
 *  - StdioServerTransport (communicates over stdin/stdout for IDE integration)
 *  - LanceDB client (initialised eagerly so table schemas are ready)
 *  - Tool & resource registrations (Phase 2 / 3 — stubs for now)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { config } from "./config.js";
import { getDbClient, closeDbClient } from "./db/client.js";

// ---------------------------------------------------------------------------
// Server metadata
// ---------------------------------------------------------------------------

const SERVER_NAME = "chat-mcp";
const SERVER_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Logger (writes to stderr so it doesn't pollute the MCP stdio channel)
// ---------------------------------------------------------------------------

function log(level: "info" | "warn" | "error", message: string): void {
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const configured = levels[config.logLevel] ?? 1;
  if (levels[level] >= configured) {
    const prefix = `[chat-mcp] [${level.toUpperCase()}]`;
    process.stderr.write(`${prefix} ${message}\n`);
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function registerShutdownHandlers(server: McpServer): void {
  const shutdown = async (signal: string) => {
    log("info", `Received ${signal} — shutting down`);
    try {
      await server.close();
    } finally {
      closeDbClient();
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// ---------------------------------------------------------------------------
// Tool & resource registration (populated in Phase 2 / 3)
// ---------------------------------------------------------------------------

/**
 * Register all MCP tools on the server.
 *
 * Phase 2 will call registerIngestTool(server) here.
 * Phase 3 will call registerSearchTool(server) here.
 */
function registerTools(_server: McpServer): void {
  // Intentionally empty — Phase 2 / 3 implementations plug in here.
}

/**
 * Register all MCP resources on the server.
 *
 * Phase 3 will expose:
 *  - chat://sessions/latest
 *  - chat://session/:id
 */
function registerResources(_server: McpServer): void {
  // Intentionally empty — Phase 3 implementation plugs in here.
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("info", `Starting ${SERVER_NAME} v${SERVER_VERSION}`);
  log("info", `LanceDB path : ${config.lancedbPath}`);
  log("info", `Exports dir  : ${config.exportsDir}`);
  log("info", `Vector dims  : ${config.vectorDimensions}`);
  log("info", `Log level    : ${config.logLevel}`);

  // 1. Initialise LanceDB — ensures tables exist before accepting requests
  log("info", "Initialising LanceDB...");
  await getDbClient();
  log("info", "LanceDB ready");

  // 2. Create MCP server
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // 3. Register tools and resources
  registerTools(server);
  registerResources(server);

  // 4. Wire up graceful shutdown
  registerShutdownHandlers(server);

  // 5. Connect to stdio transport and start listening
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log("info", "Server connected — listening on stdio");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[chat-mcp] [ERROR] Fatal: ${message}\n`);
  process.exit(1);
});
