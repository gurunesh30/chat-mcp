import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas — used for runtime validation during ingestion
// ---------------------------------------------------------------------------

export const ChatRoleSchema = z.enum(["user", "assistant", "system"]);

export const ChatMessageSchema = z.object({
  /** Unique identifier for this message */
  id: z.string(),
  /** The session this message belongs to */
  sessionId: z.string(),
  /** Conversation turn role */
  role: ChatRoleSchema,
  /** Raw text content of the message */
  content: z.string(),
  /** UTC epoch milliseconds */
  timestamp: z.number(),
  /**
   * Dense embedding vector produced by the embedding model.
   * Stored as a plain number array; LanceDB expects Float32Array on write
   * but we keep it as number[] in application code for convenience.
   */
  vector: z.array(z.number()).optional(),
  /** Optional source metadata (model name, token count, etc.) */
  metadata: z.record(z.unknown()).optional(),
});

export const ChatSessionSchema = z.object({
  /** Unique identifier for this session / conversation */
  id: z.string(),
  /** Human-readable title (first user message or explicit title) */
  title: z.string(),
  /** Chat provider that produced this export */
  source: z.enum(["chatgpt", "claude", "gemini", "unknown"]),
  /** UTC epoch milliseconds of the first message */
  createdAt: z.number(),
  /** UTC epoch milliseconds of the last message */
  updatedAt: z.number(),
  /** Ordered list of messages that make up the session */
  messages: z.array(ChatMessageSchema),
  /** Optional tags or labels attached to the session */
  tags: z.array(z.string()).optional(),
});

export const SearchQuerySchema = z.object({
  /** Natural-language query text */
  query: z.string().min(1),
  /** Maximum number of results to return (default: 10) */
  topK: z.number().int().positive().default(10),
  /** Optional filter: restrict results to a specific source */
  source: z
    .enum(["chatgpt", "claude", "gemini", "unknown"])
    .optional(),
  /** Optional filter: only include messages from specific sessions */
  sessionIds: z.array(z.string()).optional(),
  /** Optional date range — UTC epoch ms lower bound */
  fromTimestamp: z.number().optional(),
  /** Optional date range — UTC epoch ms upper bound */
  toTimestamp: z.number().optional(),
});

export const SearchResultSchema = z.object({
  /** The message that matched */
  message: ChatMessageSchema,
  /** Parent session metadata (id, title, source) */
  session: ChatSessionSchema.pick({ id: true, title: true, source: true }),
  /** Similarity score in [0, 1]; higher is more relevant */
  score: z.number(),
});

// ---------------------------------------------------------------------------
// TypeScript types derived from schemas
// ---------------------------------------------------------------------------

export type ChatRole = z.infer<typeof ChatRoleSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatSession = z.infer<typeof ChatSessionSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;

// ---------------------------------------------------------------------------
// LanceDB row shapes (flat, no nested objects)
// ---------------------------------------------------------------------------

/** Flat row written to the `messages` LanceDB table */
export interface MessageRow {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  /** Float32Array stored by LanceDB; deserialized to number[] on read */
  vector: Float32Array;
  metadataJson: string; // JSON-serialised metadata blob
}

/** Flat row written to the `sessions` LanceDB table */
export interface SessionRow {
  id: string;
  title: string;
  source: "chatgpt" | "claude" | "gemini" | "unknown";
  createdAt: number;
  updatedAt: number;
  tagsJson: string; // JSON-serialised string[]
  messageCount: number;
}

// ---------------------------------------------------------------------------
// Ingestion result types
// ---------------------------------------------------------------------------

export interface IngestResult {
  sessionId: string;
  messagesIngested: number;
  skipped: number;
  errors: string[];
}
