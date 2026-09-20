/**
 * vectorStore.ts
 *
 * All read and write operations against the LanceDB `messages` and `sessions`
 * tables live here.  Consumers never touch the raw LanceDB Table directly.
 *
 * Write path  (Phase 2): upsertSession, upsertMessages
 * Read path   (Phase 3): searchMessages, getLatestSessions, getSessionById,
 *                        getMessagesBySession
 */

import { getDbClient } from "./client.js";
import type {
  ChatSession,
  MessageRow,
  SearchQuery,
  SearchResult,
  SessionRow,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the set of message IDs already stored for a given session.
 * Used to skip re-embedding messages on re-ingestion.
 */
async function getExistingMessageIds(sessionId: string): Promise<Set<string>> {
  const { messagesTable } = await getDbClient();
  const safe = sessionId.replace(/'/g, "''");
  const rows = await messagesTable
    .query()
    .where(`sessionId = '${safe}'`)
    .select(["id"])       // VectorQuery / Query both expose select()
    .toArray();
  return new Set(rows.map((r) => String(r.id)));
}

/** Return true if a session row with `sessionId` already exists. */
async function sessionExists(sessionId: string): Promise<boolean> {
  const { sessionsTable } = await getDbClient();
  const safe = sessionId.replace(/'/g, "''");
  const rows = await sessionsTable
    .query()
    .where(`id = '${safe}'`)
    .limit(1)
    .toArray();
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

/**
 * Upsert a session row into the `sessions` table.
 *
 * If the session already exists the stale row is deleted before re-inserting
 * so title / updatedAt / messageCount are always current.
 */
export async function upsertSession(session: ChatSession): Promise<void> {
  const { sessionsTable } = await getDbClient();

  if (await sessionExists(session.id)) {
    const safe = session.id.replace(/'/g, "''");
    await sessionsTable.delete(`id = '${safe}'`);
  }

  const row: SessionRow = {
    id: session.id,
    title: session.title,
    source: session.source,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    tagsJson: JSON.stringify(session.tags ?? []),
    messageCount: session.messages.length,
  };

  // LanceDB accepts plain objects; Int64 schema columns need BigInt values
  await sessionsTable.add([
    {
      ...row,
      createdAt: BigInt(row.createdAt),
      updatedAt: BigInt(row.updatedAt),
      messageCount: BigInt(row.messageCount),
    },
  ]);
}

/**
 * Insert new message rows into the `messages` table.
 * Any row whose `id` already exists for this session is silently skipped
 * (idempotent re-ingestion).
 *
 * Every row in `rows` must already have its `vector` field populated.
 *
 * @returns Number of rows actually written.
 */
export async function upsertMessages(
  rows: MessageRow[],
  sessionId: string
): Promise<number> {
  if (rows.length === 0) return 0;

  const { messagesTable } = await getDbClient();
  const existing = await getExistingMessageIds(sessionId);

  const newRows = rows.filter((r) => !existing.has(r.id));
  if (newRows.length === 0) return 0;

  // LanceDB coerces plain number[] to FixedSizeList<Float32>.
  // Int64 schema columns require BigInt.
  const lanceRows = newRows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    role: r.role,
    content: r.content,
    timestamp: BigInt(r.timestamp),
    vector: Array.from(r.vector),   // Float32Array → plain number[]
    metadataJson: r.metadataJson,
  }));

  await messagesTable.add(lanceRows);
  return newRows.length;
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

/**
 * Return the `limit` most-recently-updated sessions, sorted by updatedAt desc.
 */
export async function getLatestSessions(limit: number): Promise<SessionRow[]> {
  const { sessionsTable } = await getDbClient();

  // Fetch a generous window then sort in JS (embedded LanceDB has no ORDER BY)
  const rows = await sessionsTable.query().limit(limit * 5).toArray();

  rows.sort((a, b) => Number(BigInt(b.updatedAt) - BigInt(a.updatedAt)));

  return rows.slice(0, limit).map(rowToSession);
}

/** Fetch a single session row by id, or null if absent. */
export async function getSessionById(id: string): Promise<SessionRow | null> {
  const { sessionsTable } = await getDbClient();
  const safe = id.replace(/'/g, "''");
  const rows = await sessionsTable
    .query()
    .where(`id = '${safe}'`)
    .limit(1)
    .toArray();
  return rows.length > 0 ? rowToSession(rows[0]) : null;
}

/** Return all message rows for a session, ordered by timestamp ascending. */
export async function getMessagesBySession(
  sessionId: string
): Promise<MessageRow[]> {
  const { messagesTable } = await getDbClient();
  const safe = sessionId.replace(/'/g, "''");
  const rows = await messagesTable
    .query()
    .where(`sessionId = '${safe}'`)
    .toArray();

  return rows
    .map(rowToMessage)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Vector similarity search over the `messages` table.
 *
 * Fetches `topK * 3` candidates from LanceDB, applies optional metadata
 * filters (source, sessionIds, date range) in JS, then returns the top `topK`.
 *
 * @param queryVector  Float32Array length == config.vectorDimensions
 * @param query        SearchQuery carrying filter fields and topK
 */
export async function searchMessages(
  queryVector: Float32Array,
  query: SearchQuery
): Promise<SearchResult[]> {
  const { messagesTable, sessionsTable } = await getDbClient();

  const topK = query.topK ?? 10;

  // VectorQuery.select() is the correct method (not selectColumns)
  const rawResults = await messagesTable
    .vectorSearch(Array.from(queryVector))
    .limit(topK * 4)   // over-fetch to absorb post-filter drops
    .select(["id", "sessionId", "role", "content", "timestamp", "metadataJson"])
    .toArray();

  // Collect unique session ids for batch hydration
  const uniqueSessionIds = [
    ...new Set(rawResults.map((r) => String(r.sessionId))),
  ];

  const sessionMap = new Map<
    string,
    { id: string; title: string; source: string }
  >();
  for (const sid of uniqueSessionIds) {
    const safe = sid.replace(/'/g, "''");
    const sRows = await sessionsTable
      .query()
      .where(`id = '${safe}'`)
      .limit(1)
      .toArray();
    if (sRows.length > 0) {
      sessionMap.set(sid, {
        id: String(sRows[0].id),
        title: String(sRows[0].title),
        source: String(sRows[0].source),
      });
    }
  }

  const results: SearchResult[] = [];

  for (const r of rawResults) {
    if (results.length >= topK) break;

    const sid = String(r.sessionId);
    const sessionMeta = sessionMap.get(sid);
    if (!sessionMeta) continue;

    // Optional post-filters
    if (query.source && sessionMeta.source !== query.source) continue;
    if (query.sessionIds && !query.sessionIds.includes(sid)) continue;
    const ts = Number(r.timestamp);
    if (query.fromTimestamp !== undefined && ts < query.fromTimestamp) continue;
    if (query.toTimestamp !== undefined && ts > query.toTimestamp) continue;

    // _distance is L2 distance (lower = more similar); convert to [0,1] score
    const distance = typeof r._distance === "number" ? r._distance : 1;
    const score = Math.max(0, 1 - distance);

    results.push({
      message: {
        id: String(r.id),
        sessionId: sid,
        role: String(r.role) as "user" | "assistant" | "system",
        content: String(r.content),
        timestamp: ts,
        metadata: JSON.parse(
          String(r.metadataJson || "{}")
        ) as Record<string, unknown>,
      },
      session: {
        id: sessionMeta.id,
        title: sessionMeta.title,
        source: sessionMeta.source as "chatgpt" | "claude" | "gemini" | "unknown",
      },
      score,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Private row-mapping helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSession(r: any): SessionRow {
  return {
    id: String(r.id),
    title: String(r.title),
    source: String(r.source) as SessionRow["source"],
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    tagsJson: String(r.tagsJson),
    messageCount: Number(r.messageCount),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMessage(r: any): MessageRow {
  return {
    id: String(r.id),
    sessionId: String(r.sessionId),
    role: String(r.role) as MessageRow["role"],
    content: String(r.content),
    timestamp: Number(r.timestamp),
    vector: r.vector as Float32Array,
    metadataJson: String(r.metadataJson),
  };
}
