/**
 * fileWatcher.ts
 *
 * Phase 2 — Local file watcher (task 2.3)
 *
 * Uses chokidar to monitor the `./exports` directory for new or modified
 * `.json` and `.md` files and automatically ingests them into LanceDB via
 * the same ingestSession() pipeline used by the MCP tool.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";

import { ingestSession } from "../tools/ingestTool.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Returned by startFileWatcher so the caller can stop watching cleanly. */
export interface WatcherHandle {
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple stderr logger — avoids importing the full server logger. */
function log(level: "info" | "warn" | "error", msg: string): void {
  process.stderr.write(`[chat-mcp] [WATCHER] [${level.toUpperCase()}] ${msg}\n`);
}

/** Derive a format hint from a file extension / path. */
function hintFromPath(filePath: string): string | undefined {
  const base = path.basename(filePath).toLowerCase();
  if (base.endsWith(".md")) return "markdown";
  // Common ChatGPT/Claude export filenames
  if (base.includes("conversations")) return "chatgpt";
  if (base.includes("claude")) return "claude";
  if (base.includes("gemini")) return "gemini";
  return undefined; // let auto-detect handle it
}

/**
 * Process a single file: read → ingest → log result.
 * Never throws — all errors are caught and logged so the watcher
 * continues running even if one file fails.
 */
async function processFile(filePath: string): Promise<void> {
  log("info", `Processing: ${filePath}`);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    log("error", `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (!raw.trim()) {
    log("warn", `Skipping empty file: ${filePath}`);
    return;
  }

  try {
    const hint = hintFromPath(filePath);
    const results = await ingestSession(raw, hint);

    for (const r of results) {
      if (r.errors.length > 0) {
        log("warn", `Session ${r.sessionId}: ${r.messagesIngested} indexed, ${r.skipped} skipped — errors: ${r.errors.join("; ")}`);
      } else {
        log("info", `Session ${r.sessionId}: ${r.messagesIngested} messages indexed, ${r.skipped} skipped`);
      }
    }

    if (results.length === 0) {
      log("warn", `No sessions found in: ${filePath}`);
    }
  } catch (err) {
    log("error", `Ingestion error for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start watching `exportsDir` for `.json` and `.md` files.
 *
 * Behaviour:
 * - `add`    fires for files that exist at startup and for new files dropped in
 * - `change` fires when an existing file is modified/overwritten
 * - Unrecognised or empty files are skipped with a warning
 * - Errors in one file never crash the watcher
 *
 * @param exportsDir  Absolute path to the directory to watch.
 * @returns A WatcherHandle with a `stop()` method for clean teardown.
 */
export async function startFileWatcher(
  exportsDir: string
): Promise<WatcherHandle> {
  // Ensure the directory exists so chokidar doesn't throw
  await fs.mkdir(exportsDir, { recursive: true });

  const watcher: FSWatcher = watch(
    exportsDir,
    {
      // Only watch .json and .md files
      ignored: (filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();
        // Always allow directories through (chokidar needs them for recursion)
        return ext !== "" && ext !== ".json" && ext !== ".md";
      },
      persistent: true,
      ignoreInitial: false,   // process files that already exist on startup
      awaitWriteFinish: {
        // Wait for the file write to stabilise before firing the event.
        // Prevents partial-read issues with large exports.
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    }
  );

  watcher.on("add", (filePath) => {
    void processFile(filePath);
  });

  watcher.on("change", (filePath) => {
    void processFile(filePath);
  });

  watcher.on("error", (err) => {
    log("error", `Watcher error: ${err instanceof Error ? err.message : String(err)}`);
  });

  // Wait for chokidar to finish its initial scan before returning
  await new Promise<void>((resolve) => watcher.once("ready", resolve));

  log("info", `Watching for chat exports in: ${exportsDir}`);

  return {
    stop: () => watcher.close(),
  };
}
