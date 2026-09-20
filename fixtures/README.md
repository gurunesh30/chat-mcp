# Fixtures

Sample chat export files for testing the `ingest_chat_session` tool and the file watcher.

| File | Format | Topic |
|---|---|---|
| `chatgpt-sample.json` | ChatGPT `conversations.json` | Redis caching strategies & cache stampede |
| `claude-sample.json` | Claude export JSON | TypeScript strict mode migration |
| `gemini-sample.json` | Gemini / Google Takeout JSON | React Server Components & Server Actions |
| `markdown-sample.md` | Markdown transcript | Kafka vs RabbitMQ, dead-letter queues |

## Usage

**Auto-ingest via file watcher** — copy any fixture into `./exports/`:
```bash
cp fixtures/chatgpt-sample.json exports/
```
The server will detect and ingest the file automatically within 500 ms.

**Manual ingest via MCP Inspector:**
```bash
npm run inspect
```
Then call `ingest_chat_session` with the file contents as the `content` parameter.

**Query after ingesting:**
Call `query_chat_context` with a query like:
- `"Redis cache stampede solutions"`
- `"TypeScript strict null checks"`
- `"React Server Components vs Client Components"`
- `"RabbitMQ dead letter queue"`
