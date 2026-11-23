# Spike: Basic Memory from a Node backend (Task 8)

Date: 2026-11-23 · Version tested: `basic-memory` 1.0.0 (PyPI), `@modelcontextprotocol/sdk` 1.32.2, Node 22.

## What was tried
Installed Basic Memory in a venv, pointed `BASIC_MEMORY_HOME` at a sample vault (`Clio/Daily`, `Clio/Notes`), started
`basic-memory mcp --transport streamable-http --port 8765`, and connected from Node with
`StreamableHTTPClientTransport` at `http://127.0.0.1:8765/mcp`.

## Findings
- **Transport:** `streamable-http` works from Node. `stdio` and `sse` also exist. The HTTP transport has **no authentication**
  (the CLI says so), so the container must only be reachable on the internal Docker network, never published.
- **Tool names differ from older docs.** In 1.0.0 the tools are `bm_search`, `bm_find`, `bm_read`, `bm_write`, `bm_edit`,
  `bm_list`, `bm_move`, `bm_delete`, `bm_context`, `bm_schema`, `bm_project`, `bm_man`. There is no `search_notes`.
- **Scope is required:** `bm_search` needs `project` (or `all_projects`). `BASIC_MEMORY_HOME` creates a default project named `main`.
- **Search modes:** `hybrid` (default when semantic search is available), `text`, `semantic`, `title`, `permalink`.
  `text` works offline and returned the right notes in ~40 ms each, and `[]`-equivalent ("No results") for a nonsense query.
- **Result format is plain text**, one line per hit: `- <path> | <title> | score <n>`. No snippet is returned, so Clio reads the
  file through the vault service to build snippets and to apply the private-note filter.
- **Hybrid/semantic search could NOT be verified.** It downloads a FastEmbed model from `huggingface.co` on first use; this
  sandbox blocks that host (HTTP 403 from the egress proxy), so the call hangs. In a real deployment the container needs
  access to `huggingface.co` on first start, or the model must be baked into the image. Not measured: first-start time,
  image size, quality of semantic recall.
- **Not tested:** behaviour when a file is edited by Obsidian/sync at the same time as a search; whether the server's file
  watcher picks up new files immediately (Clio's client therefore treats `reindex()` as a no-op and relies on Basic Memory's own sync).
- **`includePrivate`:** Basic Memory has no notion of it; Clio post-filters hits by reading each hit's frontmatter (`private: true`).

## Decision
- `MEMORY_BACKEND=plain` stays the **default** (verified, no extra service). `basic-memory` is **opt-in** via
  `MEMORY_BACKEND=basic-memory` plus the `memory` Compose profile.
- The Basic Memory client asks for `hybrid` with a short timeout and falls back to `text`, so a blocked model download
  degrades to keyword search instead of hanging chat.
- If Basic Memory is unreachable at startup or at call time, the service falls back to the plain implementation and logs a warning.
