/**
 * parser.ts
 *
 * Normalises raw chat-export files (JSON / Markdown) from ChatGPT, Claude,
 * and Gemini into the unified ChatSession schema.
 *
 * Supported formats
 * -----------------
 * chatgpt  — conversations.json exported from ChatGPT (array of conversation objects)
 * claude   — claude_conversations.json exported from Claude.ai
 * gemini   — Google Takeout "Gemini Apps Activity" JSON
 * markdown — generic  "## User / ## Assistant" Markdown transcript
 */

import crypto from "node:crypto";
import type { ChatMessage, ChatRole, ChatSession } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID();
}

function nowMs(): number {
  return Date.now();
}

/** Clamp a role string to our union type, falling back to "assistant". */
function toRole(raw: string): ChatRole {
  const r = raw.toLowerCase();
  if (r === "user") return "user";
  if (r === "system") return "system";
  return "assistant";
}

/** Truncate a string to the first `n` chars for use as a title. */
function snippet(text: string, n = 80): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > n ? trimmed.slice(0, n - 1) + "…" : trimmed;
}

// ---------------------------------------------------------------------------
// ChatGPT parser
// ---------------------------------------------------------------------------
//
// Expected shape (conversations.json):
//
// [
//   {
//     "id": "...",
//     "title": "...",
//     "create_time": 1700000000,
//     "update_time": 1700001000,
//     "mapping": {
//       "<node-id>": {
//         "message": {
//           "id": "...",
//           "author": { "role": "user" | "assistant" | "system" },
//           "content": { "content_type": "text", "parts": ["..."] },
//           "create_time": 1700000000
//         },
//         "parent": "<node-id>" | null,
//         "children": ["<node-id>"]
//       }
//     }
//   }
// ]

interface ChatGPTNode {
  message?: {
    id: string;
    author?: { role?: string };
    content?: { content_type?: string; parts?: unknown[] };
    create_time?: number | null;
  } | null;
  parent?: string | null;
  children?: string[];
}

interface ChatGPTConversation {
  id?: string;
  title?: string;
  create_time?: number | null;
  update_time?: number | null;
  mapping?: Record<string, ChatGPTNode>;
}

export function parseChatGPT(raw: string): ChatSession[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("parseChatGPT: invalid JSON");
  }

  const conversations: ChatGPTConversation[] = Array.isArray(data)
    ? (data as ChatGPTConversation[])
    : [data as ChatGPTConversation];

  return conversations.map((conv) => {
    const sessionId = conv.id ?? uuid();
    const createdAt = conv.create_time ? conv.create_time * 1000 : nowMs();
    const updatedAt = conv.update_time ? conv.update_time * 1000 : createdAt;

    // Traverse the mapping tree in topological order to get message order
    const mapping = conv.mapping ?? {};
    const messages: ChatMessage[] = [];

    // Build ordered list: walk children from root
    const visited = new Set<string>();
    function walk(nodeId: string) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = mapping[nodeId];
      if (!node) return;

      const msg = node.message;
      if (msg && msg.author?.role !== "system") {
        const parts = msg.content?.parts ?? [];
        const text = parts
          .filter((p) => typeof p === "string")
          .join("")
          .trim();
        if (text) {
          messages.push({
            id: msg.id ?? uuid(),
            sessionId,
            role: toRole(msg.author?.role ?? "assistant"),
            content: text,
            timestamp: msg.create_time ? msg.create_time * 1000 : createdAt,
          });
        }
      }

      for (const child of node.children ?? []) {
        walk(child);
      }
    }

    // Find root nodes (no parent)
    const roots = Object.entries(mapping)
      .filter(([, n]) => !n.parent)
      .map(([id]) => id);
    for (const r of roots) walk(r);

    // Fallback title
    const title =
      conv.title && conv.title.trim()
        ? conv.title.trim()
        : snippet(messages.find((m) => m.role === "user")?.content ?? "Untitled");

    return {
      id: sessionId,
      title,
      source: "chatgpt" as const,
      createdAt,
      updatedAt,
      messages,
    };
  });
}

// ---------------------------------------------------------------------------
// Claude parser
// ---------------------------------------------------------------------------
//
// Expected shape (claude_conversations.json):
//
// [
//   {
//     "uuid": "...",
//     "name": "...",
//     "created_at": "2024-01-01T00:00:00.000Z",
//     "updated_at": "2024-01-01T01:00:00.000Z",
//     "chat_messages": [
//       {
//         "uuid": "...",
//         "sender": "human" | "assistant",
//         "text": "...",
//         "created_at": "..."
//       }
//     ]
//   }
// ]

interface ClaudeMessage {
  uuid?: string;
  sender?: string;
  text?: string;
  content?: Array<{ type?: string; text?: string }>;
  created_at?: string;
}

interface ClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: ClaudeMessage[];
}

export function parseClaude(raw: string): ChatSession[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("parseClaude: invalid JSON");
  }

  const conversations: ClaudeConversation[] = Array.isArray(data)
    ? (data as ClaudeConversation[])
    : [data as ClaudeConversation];

  return conversations.map((conv) => {
    const sessionId = conv.uuid ?? uuid();
    const createdAt = conv.created_at ? Date.parse(conv.created_at) : nowMs();
    const updatedAt = conv.updated_at ? Date.parse(conv.updated_at) : createdAt;

    const messages: ChatMessage[] = (conv.chat_messages ?? []).flatMap(
      (msg) => {
        // text may live in msg.text or in msg.content[].text
        let text = msg.text ?? "";
        if (!text && Array.isArray(msg.content)) {
          text = msg.content
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("")
            .trim();
        }
        if (!text) return [];

        const role = msg.sender === "human" ? "user" : "assistant";
        return [
          {
            id: msg.uuid ?? uuid(),
            sessionId,
            role: toRole(role),
            content: text,
            timestamp: msg.created_at ? Date.parse(msg.created_at) : createdAt,
          } satisfies ChatMessage,
        ];
      }
    );

    const title =
      conv.name && conv.name.trim()
        ? conv.name.trim()
        : snippet(messages.find((m) => m.role === "user")?.content ?? "Untitled");

    return {
      id: sessionId,
      title,
      source: "claude" as const,
      createdAt,
      updatedAt,
      messages,
    };
  });
}

// ---------------------------------------------------------------------------
// Gemini parser
// ---------------------------------------------------------------------------
//
// Google Takeout wraps Gemini history in:
//
// {
//   "conversations": [
//     {
//       "id": "...",
//       "createTime": "...",
//       "updateTime": "...",
//       "parts": [
//         { "role": "user",  "text": "..." },
//         { "role": "model", "text": "..." }
//       ]
//     }
//   ]
// }

interface GeminiPart {
  role?: string;
  text?: string;
  createTime?: string;
}

interface GeminiConversation {
  id?: string;
  createTime?: string;
  updateTime?: string;
  parts?: GeminiPart[];
}

interface GeminiExport {
  conversations?: GeminiConversation[];
}

export function parseGemini(raw: string): ChatSession[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("parseGemini: invalid JSON");
  }

  // Accept both the outer wrapper and a bare array
  const convList: GeminiConversation[] = Array.isArray(data)
    ? (data as GeminiConversation[])
    : ((data as GeminiExport).conversations ?? [data as GeminiConversation]);

  return convList.map((conv) => {
    const sessionId = conv.id ?? uuid();
    const createdAt = conv.createTime ? Date.parse(conv.createTime) : nowMs();
    const updatedAt = conv.updateTime ? Date.parse(conv.updateTime) : createdAt;

    let msgTs = createdAt;
    const messages: ChatMessage[] = (conv.parts ?? []).flatMap((part) => {
      const text = part.text?.trim() ?? "";
      if (!text) return [];
      const ts = part.createTime ? Date.parse(part.createTime) : msgTs;
      msgTs = ts + 1; // ensure ascending timestamps when createTime is absent
      const role = part.role === "user" ? "user" : "assistant";
      return [
        {
          id: uuid(),
          sessionId,
          role: toRole(role),
          content: text,
          timestamp: ts,
        } satisfies ChatMessage,
      ];
    });

    const title = snippet(
      messages.find((m) => m.role === "user")?.content ?? "Gemini conversation"
    );

    return {
      id: sessionId,
      title,
      source: "gemini" as const,
      createdAt,
      updatedAt,
      messages,
    };
  });
}

// ---------------------------------------------------------------------------
// Markdown parser
// ---------------------------------------------------------------------------
//
// Parses a Markdown transcript with alternating headings:
//
//   ## User
//   Question text…
//
//   ## Assistant
//   Answer text…
//
// Lines starting with `# ` are treated as the conversation title.

export function parseMarkdown(raw: string): ChatSession {
  const sessionId = uuid();
  const now = nowMs();

  const lines = raw.split("\n");
  let title = "Markdown conversation";
  const messages: ChatMessage[] = [];

  let currentRole: ChatRole | null = null;
  let currentLines: string[] = [];

  function flush() {
    if (!currentRole || currentLines.length === 0) return;
    const content = currentLines.join("\n").trim();
    if (content) {
      messages.push({
        id: uuid(),
        sessionId,
        role: currentRole,
        content,
        timestamp: now + messages.length,
      });
    }
    currentLines = [];
  }

  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      continue;
    }

    const heading = line.trim().toLowerCase();
    if (heading === "## user" || heading === "**user**") {
      flush();
      currentRole = "user";
      continue;
    }
    if (
      heading === "## assistant" ||
      heading === "**assistant**" ||
      heading === "## model"
    ) {
      flush();
      currentRole = "assistant";
      continue;
    }
    if (heading === "## system") {
      flush();
      currentRole = "system";
      continue;
    }

    if (currentRole !== null) {
      currentLines.push(line);
    }
  }
  flush();

  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser && title === "Markdown conversation") {
    title = snippet(firstUser.content);
  }

  return {
    id: sessionId,
    title,
    source: "unknown" as const,
    createdAt: now,
    updatedAt: now,
    messages,
  };
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export type ExportFormat = "chatgpt" | "claude" | "gemini" | "markdown";

/**
 * Heuristically detect the export format from raw file content.
 * Checks structural JSON keys before falling back to Markdown.
 */
export function detectFormat(raw: string): ExportFormat {
  const trimmed = raw.trimStart();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return "markdown";
  }

  try {
    const parsed = JSON.parse(trimmed);
    const obj = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!obj || typeof obj !== "object") return "markdown";

    // Claude: chat_messages array
    if ("chat_messages" in obj || "chat_messages" in (parsed ?? {})) {
      return "claude";
    }
    // ChatGPT: mapping object with node structure
    if ("mapping" in obj) return "chatgpt";
    // Gemini: conversations wrapper or parts array
    if ("conversations" in obj || "parts" in obj) return "gemini";
    // ChatGPT array of conversations (each has mapping)
    if (Array.isArray(parsed) && "mapping" in (parsed[0] ?? {})) {
      return "chatgpt";
    }
    // Claude array
    if (Array.isArray(parsed) && "chat_messages" in (parsed[0] ?? {})) {
      return "claude";
    }
  } catch {
    // not valid JSON
  }

  return "markdown";
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

/**
 * Detect the format of `raw` and delegate to the appropriate parser.
 * Always returns an array of ChatSession objects.
 */
export function parseExportFile(raw: string, hint?: ExportFormat): ChatSession[] {
  const format = hint ?? detectFormat(raw);

  switch (format) {
    case "chatgpt":
      return parseChatGPT(raw);
    case "claude":
      return parseClaude(raw);
    case "gemini":
      return parseGemini(raw);
    case "markdown":
      return [parseMarkdown(raw)];
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown export format: ${_exhaustive}`);
    }
  }
}
