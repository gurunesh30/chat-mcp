import * as lancedb from "@lancedb/lancedb";
import {
  Schema,
  Field,
  Utf8,
  Float32,
  Int64,
  FixedSizeList,
} from "apache-arrow";
import fs from "node:fs";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Arrow schemas
// ---------------------------------------------------------------------------

/**
 * Build the Arrow schema for the `messages` table.
 * The vector column uses a FixedSizeList whose length must match
 * config.vectorDimensions (default 1536).
 */
function buildMessagesSchema(vectorDimensions: number): Schema {
  return new Schema([
    new Field("id", new Utf8(), false),
    new Field("sessionId", new Utf8(), false),
    new Field("role", new Utf8(), false),
    new Field("content", new Utf8(), false),
    // Int64 keeps ms-epoch timestamps losslessly
    new Field("timestamp", new Int64(), false),
    new Field(
      "vector",
      new FixedSizeList(
        vectorDimensions,
        new Field("item", new Float32(), true)
      ),
      // nullable=false: every message must have a vector
      false
    ),
    // JSON-serialised Record<string, unknown>
    new Field("metadataJson", new Utf8(), false),
  ]);
}

/** Schema for the `sessions` table (no vector column needed). */
const sessionsSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("title", new Utf8(), false),
  new Field("source", new Utf8(), false),
  new Field("createdAt", new Int64(), false),
  new Field("updatedAt", new Int64(), false),
  // JSON-serialised string[]
  new Field("tagsJson", new Utf8(), false),
  new Field("messageCount", new Int64(), false),
]);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DbClient {
  /** Raw LanceDB connection — use sparingly; prefer the typed helpers. */
  connection: lancedb.Connection;
  messagesTable: lancedb.Table;
  sessionsTable: lancedb.Table;
  /** Release any held resources. Safe to call multiple times. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Internal singleton
// ---------------------------------------------------------------------------

let _client: DbClient | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure a table exists, creating it from `schema` if absent.
 * Returns the open `Table` reference either way.
 */
async function ensureTable(
  db: lancedb.Connection,
  tableName: string,
  schema: Schema
): Promise<lancedb.Table> {
  const existing = await db.tableNames();
  if (existing.includes(tableName)) {
    return db.openTable(tableName);
  }
  return db.createEmptyTable(tableName, schema);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open (or reuse) the LanceDB connection and ensure both tables exist.
 *
 * Subsequent calls return the same singleton so the server holds a single
 * connection for its entire lifetime.
 */
export async function getDbClient(): Promise<DbClient> {
  if (_client) return _client;

  // Make sure the storage directory exists before connecting
  fs.mkdirSync(config.lancedbPath, { recursive: true });

  const connection = await lancedb.connect(config.lancedbPath);

  const [messagesTable, sessionsTable] = await Promise.all([
    ensureTable(connection, "messages", buildMessagesSchema(config.vectorDimensions)),
    ensureTable(connection, "sessions", sessionsSchema),
  ]);

  _client = {
    connection,
    messagesTable,
    sessionsTable,
    close() {
      // LanceDB embedded connections don't require explicit teardown,
      // but we clear the singleton so tests can re-initialise cleanly.
      _client = null;
    },
  };

  return _client;
}

/**
 * Close the current singleton connection (if open) and reset state.
 * Useful in tests and graceful shutdown handlers.
 */
export function closeDbClient(): void {
  if (_client) {
    _client.close();
    _client = null;
  }
}
