# MCP Agent Configuration

Config snippets for registering `chat-mcp` with each supported agent.

> **Before using:** run `npm run build` in the project root, then replace
> `<ABSOLUTE_PATH_TO_PROJECT>` in each snippet with the actual absolute path,
> e.g. `/home/yourname/chat-mcp`.

---

## Kiro

Merge `kiro-mcp.json` into your workspace MCP settings file at
`.kiro/settings/mcp.json` (workspace-level) or `~/.kiro/settings/mcp.json`
(user-level):

```jsonc
// .kiro/settings/mcp.json
{
  "mcpServers": {
    "chat-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/chat-mcp/build/index.js"],
      "env": { "LOG_LEVEL": "info" },
      "disabled": false
    }
  }
}
```

After saving, use **MCP: Reconnect Servers** from the Kiro command palette.

---

## Cursor

Merge `cursor-mcp.json` into `~/.cursor/mcp.json` (global) or
`.cursor/mcp.json` (project-level):

```jsonc
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "chat-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/chat-mcp/build/index.js"],
      "env": { "LOG_LEVEL": "info" }
    }
  }
}
```

Restart Cursor or reload the MCP server list from Settings → MCP.

---

## OpenCode

Merge `opencode-mcp.json` into `~/.config/opencode/config.json` or the
project-local `opencode.json`:

```jsonc
{
  "mcp": {
    "chat-mcp": {
      "type": "local",
      "command": "node",
      "args": ["/absolute/path/to/chat-mcp/build/index.js"],
      "env": { "LOG_LEVEL": "info" }
    }
  }
}
```

---

## Verify with MCP Inspector

```bash
npm run inspect
# Opens the inspector UI at http://localhost:5173
# Tools available: ingest_chat_session, query_chat_context
# Resources: chat://sessions/latest, chat://session/{id}
```

---

## Quick end-to-end test

```bash
# 1. Build
npm run build

# 2. Ingest a fixture
cp fixtures/chatgpt-sample.json exports/

# 3. Query (via inspector or agent)
# Tool: query_chat_context
# Input: { "query": "Redis cache stampede solutions" }
```
