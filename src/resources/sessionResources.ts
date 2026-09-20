/**
 * sessionResources.ts
 *
 * Phase 3 — MCP Resources (task 3.3)
 *
 * Registers two MCP resources on the server:
 *
 *   chat://sessions/latest
 *     Static resource — returns a JSON array of the most recently updated
 *     sessions (title, source, messageCount, updatedAt).
 *
 *   chat://session/{id}
 *     Template resource — returns the full session metadata plus all
 *     messages for a given session ID.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getLatestSessions, getSessionById, getMessagesBySession } from "../db/vectorStore.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

// ---------------------------------------------------------------------------
// Public registration function
// ---------------------------------------------------------------------------

/**
 * Register chat:// MCP resources on the server.
 *
 * Resources (unlike tools) are read-only and are typically used by agents to
 * browse available context before deciding what to query in detail.
 */
export function registerSessionResources(server: McpServer): void {

  // -------------------------------------------------------------------------
  // 1. chat://sessions/latest — static resource listing recent sessions
  // -------------------------------------------------------------------------

  server.resource(
    "latest-sessions",
    "chat://sessions/latest",
    {
      description:
        "JSON array of the most recently updated chat sessions indexed in the local vector store. Use this to discover what conversations are available before querying with query_chat_context.",
      mimeType: "application/json",
    },
    async (_uri) => {
      const sessions = await getLatestSessions(config.searchTopK);

      const payload = sessions.map((s) => ({
        id: s.id,
        title: s.title,
        source: s.source,
        messageCount: s.messageCount,
        tags: JSON.parse(s.tagsJson) as string[],
        updatedAt: isoDate(s.updatedAt),
        createdAt: isoDate(s.createdAt),
      }));

      return {
        contents: [
          {
            uri: "chat://sessions/latest",
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------------------
  // 2. chat://session/{id} — template resource for a specific session
  // -------------------------------------------------------------------------

  const sessionTemplate = new ResourceTemplate("chat://session/{id}", {
    list: undefined, // enumeration not supported (IDs are opaque UUIDs)
  });

  server.resource(
    "session-by-id",
    sessionTemplate,
    {
      description:
        "Full session metadata plus all messages for a given session ID. Obtain the ID from the chat://sessions/latest resource or from query_chat_context results.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const sessionId = Array.isArray(id) ? id[0] : id;

      if (!sessionId) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify({ error: "Missing session id" }),
            },
          ],
        };
      }

      const [session, messages] = await Promise.all([
        getSessionById(sessionId),
        getMessagesBySession(sessionId),
      ]);

      if (!session) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify({ error: `Session not found: ${sessionId}` }),
            },
          ],
        };
      }

      const payload = {
        id: session.id,
        title: session.title,
        source: session.source,
        messageCount: session.messageCount,
        tags: JSON.parse(session.tagsJson) as string[],
        createdAt: isoDate(session.createdAt),
        updatedAt: isoDate(session.updatedAt),
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: isoDate(m.timestamp),
          metadata: JSON.parse(m.metadataJson) as Record<string, unknown>,
        })),
      };

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );
}
