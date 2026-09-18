# chat-mcp

A lightweight MCP server that ingests chat history from ChatGPT, Claude, and Gemini, indexes it into an embedded local [LanceDB](https://lancedb.com/) vector database, and exposes retrieval tools for coding agents (OpenCode, Kiro, Cursor, Antigravity).

## Architecture

```
stdio transport (IDE ↔ server)
        │
   McpServer (MCP SDK)
        │
   ┌────┴────────────────┐
   │  tools              │
   │  ingest_chat_session│  ← Phase 2
   │  query_chat_context │  ← Phase 3
   └────┬────────────────┘
        │
   LanceDB (./storage/lancedb)
   ┌────────────┬──────────────┐
   │ messages   │   sessions   │
   │ (+ vectors)│              │
   └────────────┴──────────────┘
        ▲
   file watcher (./exports)  ← Phase 2
```

## Tech stack

| Concern | Library |
|---|---|
| Protocol | `@modelcontextprotocol/sdk` (Stdio) |
| Storage + vectors | `@lancedb/lancedb` (embedded) |
| File watching | `chokidar` |
| Validation | `zod` |
| Runtime | Node.js 22 + TypeScript (`tsx` for dev) |

## Getting started

```bash
# Install dependencies
npm install

# Build
npm run build

# Run (the IDE connects via stdio)
npm start

# Development (live reload)
npm run dev

# Test with MCP Inspector
npm run inspect
```

## Environment variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `LANCEDB_PATH` | `./storage/lancedb` | LanceDB storage directory |
| `EXPORTS_DIR` | `./exports` | Directory watched for chat export files |
| `SEARCH_TOP_K` | `10` | Max search results per query |
| `VECTOR_DIMENSIONS` | `1536` | Embedding vector size |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

## Roadmap

- **Phase 1** ✅ Foundation — TypeScript project, LanceDB schema, MCP server skeleton
- **Phase 2** 🔲 Ingestion — ChatGPT/Claude/Gemini parsers, `ingest_chat_session` tool, file watcher
- **Phase 3** 🔲 Retrieval — vector search, `query_chat_context` tool, MCP resources
- **Phase 4** 🔲 Integration — inspector testing, agent config (OpenCode, Cursor, Kiro)
