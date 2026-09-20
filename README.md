# chat-mcp

A headless Model Context Protocol (MCP) server that ingests conversation history from ChatGPT, Claude, and Gemini into a local vector database (**LanceDB**). `chat-mcp` provides long-term cross-session memory and retrieval capabilities directly to downstream coding agents like **OpenCode**, **Cursor**, **Google Antigravity**, and **AWS Kiro**.

---

## Key Features

* **Zero-Config Vector DB:** Uses LanceDB running locally inside the process—no Docker or external database services required.
* **Multi-Provider Support:** Ingests and normalizes export files from ChatGPT, Claude, and Gemini.
* **Automatic Ingestion:** Monitors an `./exports` directory with `chokidar` to parse and embed new chat exports dynamically.
* **Standard MCP Protocol:** Connects seamlessly over `stdio` to any compatible AI host environment.

---

## Project Structure

```text
chat-mcp/
├── exports/                  # Drop box for raw ChatGPT, Claude, or Gemini exports
├── storage/
│   └── lancedb/              # Local vector store data directory
├── src/
│   ├── config.ts             # Environment & path configuration
│   ├── index.ts              # MCP server setup & entry point
│   ├── db/
│   │   ├── client.ts         # LanceDB connection & table initialization
│   │   └── vectorStore.ts    # Search algorithms & embeddings pipeline
│   ├── ingest/
│   │   ├── fileWatcher.ts    # Chokidar watcher for local exports
│   │   └── parser.ts         # Multi-format JSON & Markdown transcript parsers
│   ├── tools/
│   │   ├── ingestTool.ts     # Definition for `ingest_chat_session` tool
│   │   └── searchTool.ts     # Definition for `query_chat_context` tool
│   └── types/
│       └── index.ts          # TypeScript interfaces and schemas
├── .gitignore
├── .env.example
├── package.json
├── tsconfig.json
└── README.md

```

---

## Walkthrough & Setup

### 1. Prerequisites

* **Node.js**: v18 or higher
* **npm**: v9 or higher

### 2. Installation & Build

```zsh
# Clone the repository
git clone https://github.com/your-username/chat-mcp.git
cd chat-mcp

# Install dependencies
npm install

# Build the TypeScript project
npm run build

```

### 3. Usage & Ingestion

There are two primary ways to populate your chat memory:

1. **Automatic File Sync:** Drop exported chat JSON or Markdown files into the local `./exports/` folder. The built-in file watcher parses and indexes them automatically.
2. **Direct Tool Calling:** AI host environments can programmatically stream chats using the `ingest_chat_session` tool.

### 4. Agent Integration

Register `chat-mcp` in your tool or editor settings (e.g., `mcpSettings.json` or `opencode.json`):

```json
{
  "mcpServers": {
    "chat-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/chat-mcp/build/index.js"]
    }
  }
}

```

---

## API & Tool Documentation

### Tools

#### `query_chat_context`

Searches indexed conversation history for technical decisions, code snippets, or architectural choices.

* **Input Schema:**
```json
{
  "query": "string (Required) - Search string or architectural decision to query",
  "limit": "number (Optional) - Number of relevant turns to return. Default: 5"
}

```


* **Output Format:**
Returns an array of JSON objects matching the search query, including message content, original session ID, and role.

---

#### `ingest_chat_session`

Programmatically saves a full conversation thread into the local vector database.

* **Input Schema:**
```json
{
  "session_id": "string (Required) - Unique ID for the conversation session",
  "messages": [
    {
      "role": "user | assistant | system (Required)",
      "content": "string (Required)"
    }
  ]
}

```


* **Output Format:**
Confirmation message with total count of indexed messages.

---

### Resources

#### `chat://sessions/latest`

Provides downstream agents with immediate context from the most recently ingested chat transcript.

* **URI:** `chat://sessions/latest`
* **MIME Type:** `application/json`
