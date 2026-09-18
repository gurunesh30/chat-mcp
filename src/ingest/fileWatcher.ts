/**
 * fileWatcher.ts
 *
 * Watches the `./exports` directory with chokidar and triggers automatic
 * ingestion whenever a `.json` or `.md` file is added or changed.
 * Full implementation is Phase 2 (task 2.3).
 */

/** Handle returned by startFileWatcher so callers can stop the watcher. */
export interface WatcherHandle {
  /** Stop watching and release all chokidar resources. */
  stop(): Promise<void>;
}

/**
 * Start watching `exportsDir` for new or modified chat export files.
 *
 * Phase 2 will:
 *  - initialise a chokidar FSWatcher on `exportsDir`
 *  - on `add` / `change` events, read the file and call parseExportFile()
 *  - pass parsed sessions to the ingest pipeline (ingestTool)
 *  - log success / error per file without crashing the watcher
 *
 * @param exportsDir Absolute path to the directory to watch.
 * @returns A WatcherHandle that can be used to stop the watcher cleanly.
 * @throws {Error} Not yet implemented
 */
export async function startFileWatcher(
  _exportsDir: string
): Promise<WatcherHandle> {
  throw new Error("fileWatcher.startFileWatcher — not yet implemented (Phase 2)");
}
