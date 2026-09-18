/**
 * parser.ts
 *
 * Normalises raw chat-export files (JSON / Markdown) from ChatGPT, Claude,
 * and Gemini into the unified ChatSession schema.
 * Full implementation is Phase 2 (task 2.1).
 */

import type { ChatSession } from "../types/index.js";

/** Supported export format identifiers */
export type ExportFormat = "chatgpt" | "claude" | "gemini" | "markdown";

/**
 * Detect the export format of a raw file buffer / string.
 *
 * Phase 2 will inspect the JSON structure or Markdown frontmatter to
 * determine which parser to delegate to.
 *
 * @throws {Error} Not yet implemented
 */
export function detectFormat(_raw: string): ExportFormat {
  throw new Error("parser.detectFormat — not yet implemented (Phase 2)");
}

/**
 * Parse a ChatGPT `conversations.json` export into ChatSession objects.
 *
 * @throws {Error} Not yet implemented
 */
export function parseChatGPT(_raw: string): ChatSession[] {
  throw new Error("parser.parseChatGPT — not yet implemented (Phase 2)");
}

/**
 * Parse a Claude export JSON into ChatSession objects.
 *
 * @throws {Error} Not yet implemented
 */
export function parseClaude(_raw: string): ChatSession[] {
  throw new Error("parser.parseClaude — not yet implemented (Phase 2)");
}

/**
 * Parse a generic Markdown conversation file into a single ChatSession.
 * Expects alternating `## User` / `## Assistant` headings.
 *
 * @throws {Error} Not yet implemented
 */
export function parseMarkdown(_raw: string): ChatSession {
  throw new Error("parser.parseMarkdown — not yet implemented (Phase 2)");
}

/**
 * Top-level entry point: detect format and delegate to the right parser.
 * Returns one or more ChatSession objects extracted from the file content.
 *
 * @throws {Error} Not yet implemented
 */
export function parseExportFile(_raw: string): ChatSession[] {
  throw new Error("parser.parseExportFile — not yet implemented (Phase 2)");
}
