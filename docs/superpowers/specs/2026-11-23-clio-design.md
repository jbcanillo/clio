# Clio — Design

Status: **draft for approval** · Date: 2026-11-23 · Supersedes: the earlier Mem0/Chroma/Ollama idea

Clio is the new name for numdum (a note, diary and reminder PWA). Clio is the Greek muse of history. It is a sibling of **Mnemosyne** (memory, RAG) and **Echo** (voice).

## 1. Intent

Turn numdum from a form-based reminder app into a **smart, conversational companion** that:

- Is a full interactive chat where the AI answers with real UI (reminder cards, mood charts, check-in forms), not only text.
- **Reminds you every day to write**: thoughts, ideas, what happened, mood.
- Uses an **Obsidian vault as its database and memory**, so everything is plain markdown you can open, read and edit in Obsidian at any time.
- Uses **OpenRouter** for AI.
- Treats the data as private and encrypted wherever the design allows (see §8).
- Ships as a **Docker** stack in the same style as Echo and Mnemosyne.

## 2. Goals, non-goals, anti-goals

**Goals**
- Chat-first UI with generative components (CopilotKit).
- Daily nudge via push notification, opening into a check-in card.
- Vault is the single source of truth; Obsidian and Clio can edit the same files.
- Notes can be written offline and sync later.
- One `docker compose up` to run.

**Non-goals (v1)**
- Multi-user accounts (single owner only).
- Embeddings or a separate vector database run by us (Basic Memory brings its own local semantic search; we run nothing extra).
- Native mobile apps.
- Offline *chat*, offline reminders or offline search. Only note capture works offline.

**Anti-goals** (failure even if it "works")
- Silent data loss or silent overwrite when Obsidian and Clio both edit a note.
- Private diary text leaving the server for a cloud model without the owner choosing that.
- The AI inventing or rewriting the owner's entries.

## 3. Constraints and facts found

- Existing numdum: React 18 PWA on Create React App + craco (JS), Tailwind + daisyUI, IndexedDB (`reminders`, `journals` stores), Express `server.js` for web-push with in-memory subscriptions, tests in `src/__tests__`, Docker on port 4356.
- Echo: Vite + React + TypeScript PWA, nginx frontend container, Express backend, one root `.env`, OpenRouter key saved server-side from a Settings screen, named volumes.
- Mnemosyne: Express with `controllers/` and `services/`, API-key + session-token auth with lockout, guardrails, config volume, backup scripts, a privacy impact assessment (Philippine Data Privacy Act).
- **Basic Memory** (basicmachines-co, per web search, to be re-verified in Phase 1): local-first MCP server; notes are markdown with wikilinks and frontmatter; SQLite index; recent versions add hybrid full-text + vector search using **FastEmbed (local)**; Obsidian can open the same folder; official Docker image `mcp/basic-memory`; **license AGPL-3.0**.
- CopilotKit: `useCopilotAction` with a `render` function gives generative UI; `useCopilotReadable` shares app state; the runtime accepts an OpenAI-compatible client. OpenRouter is OpenAI-compatible, so pointing the OpenAI adapter at its base URL is expected to work but is **unverified** (Phase 2 spike).

## 4. Approaches considered

**App structure** (chosen by owner: B)
- A. Grow numdum in place on CRA. Rejected: CRA is unmaintained, doesn't match sibling projects.
- **B. Restructure to Echo/Mnemosyne layout in the same repo (chosen).** `frontend/` (Vite + TS) + `backend/` (Express) + compose. Port existing components and tests.
- C. Fresh repo. Rejected: loses history.

**Vault hosting** (chosen by owner: A) — vault is a folder on the server volume, synced to desktop Obsidian with Git or Syncthing. Rejected: Obsidian Local REST API (needs desktop always on), browser File System Access (no iOS, no Docker benefit).

**Memory layer**
- Mem0 (self-hosted): rejected, needs a vector store and embedder we'd have to run and feed, and rewrites facts instead of keeping notes.
- Plain vault + our own full-text search: viable fallback.
- **Basic Memory (chosen by owner).** Markdown stays the database, it is the memory layer, and it supplies search. Fallback if it misbehaves: the plain-vault option behind the same interface.

**Chat framework**
- assistant-ui + Vercel AI SDK: viable, more custom UI, more glue.
- **CopilotKit (chosen).** Built-in app-state sharing, actions, human-approval and runtime.

## 5. Architecture

```
Browser (Vite PWA)                         Docker network
 ├─ CopilotKit chat + generative components ──► clio-web (nginx, :4356)
 ├─ encrypted offline outbox (notes only)        │  /api →
 └─ service worker (push, outbox sync)           ▼
                                           clio-api (Node 20, Express)
                                            ├─ auth (password, session token, lockout)
                                            ├─ CopilotKit runtime ──► OpenRouter (cloud LLM)
                                            ├─ vault service (read/write markdown, conflict check)
                                            ├─ memory service ──► basic-memory (MCP, separate container)
                                            ├─ scheduler (node-cron) + web-push
                                            └─ settings (OpenRouter key etc.)
                                           basic-memory (Python) ──┐
                                           vault volume (markdown) ◄┘── shared with clio-api
                                           vault-sync (optional: git or Syncthing) ◄──► desktop Obsidian
```

Repo layout after migration:

```
frontend/   Vite + React + TS (PWA, CopilotKit UI, existing components ported)
backend/    src/{controllers,services,middleware,routes}  (Mnemosyne-style)
docker-compose.yml  .env.example  scripts/ (backup)  docs/
```

## 6. Vault layout (the "database")

```
Clio/
  Daily/2026-11-23.md        daily note: frontmatter {date, mood, energy, tags, private}
  Notes/<slug>.md            free notes and ideas
  Events/<date>-<slug>.md    things that happened
  Reminders/<id>.md          frontmatter {due, priority, repeat, done, snoozedUntil}
  Memory/Profile.md          curated facts about the owner (AI-maintained, human-editable)
  Memory/Patterns.md         observed patterns (sleep, mood, habits)
  Attachments/               photos
```

Rules: frontmatter is the queryable schema (mood charts and analytics read it). The AI may append to or propose edits to `Memory/*`; it never rewrites `Daily/` or `Notes/` content without an approval card. Each write carries the file's last-known hash so a concurrent Obsidian edit is detected, not overwritten.

## 7. Behaviour

**Chat and generative UI.** CopilotKit actions with render components, mostly reusing existing components:
`show_reminders` (ReminderItem list), `show_calendar`, `show_mood_chart` (Recharts), `checkin_form` (mood, what happened, ideas), `note_preview` (save / edit / discard), `search_results`, `confirm_action` (approve / edit before delete or overwrite). Action tools: `create_reminder`, `append_to_daily`, `create_note`, `search_memory`, `update_profile`. Current screen, today's date and open note are shared via `useCopilotReadable`.

**Daily check-in.** The scheduler runs at the owner's chosen time. If `Daily/<today>.md` has no entry, it sends a web push (VAPID, existing setup, subscriptions now persisted to the data volume). Tapping opens chat with the `checkin_form` card. Clio then asks short follow-ups using memory. A second gentler nudge in the evening if still empty; the owner can snooze or skip.

**Offline notes.** Offline, new notes and edits go to an AES-GCM encrypted queue in the browser (key from the login passphrase). On reconnect the service worker posts them; the server writes markdown and Basic Memory reindexes. Conflict → keep both versions and show a side-by-side resolve card. Everything else needs a connection.

**Reminders** move from IndexedDB into the vault; the scheduler reads them for notifications. Existing numdum data is imported once from its backup/restore JSON.

## 8. Privacy and encryption (what is and isn't achievable)

- Transport: HTTPS (required for service workers and push anyway); Git/Syncthing sync is encrypted in transit.
- At rest: vault and config volumes on an encrypted disk/volume (owner's host setup, documented); browser outbox encrypted with WebCrypto AES-GCM; backups encrypted (reuse existing crypto approach).
- **Limit, stated plainly:** the running server and Basic Memory must read plaintext to search and to let the AI use it, and anything placed in a prompt goes to OpenRouter and the model provider. True end-to-end encryption and cloud-AI memory cannot both hold.
- **Default policy (my call, to confirm):** diary entries are flagged `private: true`. The owner's *current* messages go to the model as typed, but retrieval of *past* private entries into a prompt requires an explicit "share with Clio this session" toggle; otherwise only notes, events and reminders are retrievable. A local-model option is out of scope for v1.
- Auth: single owner, password login, session token, lockout after repeated failures (Mnemosyne pattern). OpenRouter key stored server-side, encrypted with a key from `.env`, never returned to the browser.
- A short privacy impact note in `docs/`, as in Mnemosyne.
- Licence note: Basic Memory is AGPL-3.0. We run it unmodified as a separate container for personal use; if Clio is ever offered to others, revisit.

## 9. Docker

`docker compose up --build -d` → `clio-web`, `clio-api`, `basic-memory`, shared `vault` volume, `data` volume (config, push subscriptions, outbox receipts), optional `vault-sync`. Single root `.env` (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `CLIO_PASSWORD`, `SECRET_KEY`, VAPID keys, `PORT=4356`). README warns not to use `down -v`. Backup script for the vault and data volumes.

## 10. Phases

0. Rename to Clio, delete leftover PR/debug markdown, scaffold `frontend/` + `backend/` + compose, port tests.
1. Backend core: auth, settings, vault service (read/write/hash), **Basic Memory spike** (transport from Node, search quality, Docker), Mnemosyne-style structure.
2. Chat: CopilotKit runtime → OpenRouter (**spike**: tool calling works with the chosen model), first generative components.
3. Daily check-in: scheduler, persistent push subscriptions, `checkin_form`, follow-ups.
4. Offline outbox and sync with conflict card.
5. Port remaining features onto the vault: reminders, calendar, analytics from frontmatter, journal, one-time import; camera/contacts/map later (anything not ported is listed, not dropped silently).
6. Hardening: backups, privacy note, rate limiting, guardrails (prompt-injection protection for note content shown to the model), docs.

## 11. Risks and open items for the builder

- Basic Memory from a Node backend: transport (stdio vs HTTP) and whether it tolerates files being edited by Obsidian/sync at the same time. Spike first; fallback is plain-vault search behind the same `MemoryService` interface.
- OpenRouter + CopilotKit tool calling is unverified; model choice affects reliability.
- Basic Memory's FastEmbed downloads a model on first run; image size and first-start time to be measured.
- Vault sync tool (Git vs Syncthing): left to the builder; Git recommended for history and conflict visibility.
- Existing tests (Jest/CRA) must move to Vitest or stay on Jest; builder's call.

## 12. Calls made by me (not yet confirmed by the owner)

1. Single-user only. 2. Private-diary retrieval policy in §8. 3. Reminders and analytics live in the vault, not IndexedDB. 4. Camera/contacts/map ported after core. 5. Vite + TypeScript + Vitest. 6. Settings stores OpenRouter key encrypted server-side. 7. Two daily nudges (morning/evening configurable).
