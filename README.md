# Clio

Clio (formerly numdum) is a smart notes, diary and reminders app. You talk to it in a chat that answers with real
interface (reminder cards, mood charts, a daily check-in form), it nudges you every day to write something down, and
everything it knows lives as **plain markdown in an Obsidian vault** that you own.
It is a sibling of **Mnemosyne** (memory/RAG) and **Echo** (voice).

- **Chat with generative UI:** CopilotKit + OpenRouter. Clio can create notes and reminders, search your vault and draw cards in the conversation.
- **Daily nudge:** a push notification every morning (and an evening one if you still haven't written), opening a check-in for mood, what happened, thoughts and ideas.
- **Obsidian vault as the database:** daily notes, notes, reminders and journal entries are markdown files with frontmatter you can open and edit in Obsidian.
- **Offline notes:** write a note without a connection; it is stored encrypted in the browser and synced later. Conflicts keep both versions.
- **Private by default:** diary entries are kept out of AI prompts unless you switch on "Share private diary with Clio" for the session.
- **Self-hosted:** one `docker compose up`.

Design: [docs/superpowers/specs/2026-11-23-clio-design.md](docs/superpowers/specs/2026-11-23-clio-design.md) ·
Plan: [docs/superpowers/plans/2026-11-23-clio.md](docs/superpowers/plans/2026-11-23-clio.md) ·
Privacy: [docs/PRIVACY.md](docs/PRIVACY.md)

## Quick start

You need Docker with Compose v2.

```bash
cp .env.example .env
# edit .env: set CLIO_PASSWORD, SECRET_KEY (>= 32 random characters), TZ, and your OpenRouter key
npx web-push generate-vapid-keys      # paste the keys into VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
docker compose up --build -d
```

Open **http://localhost:4356**, sign in with `CLIO_PASSWORD`, then open **Settings** to check your timezone, set the
check-in times, press **Enable notifications**, and (if you did not put the key in `.env`) paste your
[OpenRouter](https://openrouter.ai/keys) key and press **Test key**.

> **Never run `docker compose down -v`.** It deletes the `vault` and `data` volumes, which hold all your notes.
> `docker compose down` (without `-v`) and `docker compose up --build -d` are safe.

> **Use HTTPS for anything but localhost.** Browsers only allow push notifications, service workers and the encryption
> used for offline notes on secure origins. See [HTTPS](#https).

Check a running install with `CLIO_PASSWORD=... scripts/smoke.sh`.

## Using Clio

- **Four tabs:** **Chat**, **Diary**, **Reminders** and **Notes**. Each tab has its own text chat with Clio (no voice) in a teal and orange design, light and dark.
  - **Chat:** tell Clio what happened, a thought or an idea; ask for your reminders, a mood chart, or to search your notes.
  - **Diary:** your daily notes and mood, with a day strip and Clio's reflections.
  - **Reminders:** due, upcoming, snoozed and done reminders you can complete or reschedule.
  - **Notes:** your notes and checklists; tick items off directly.
- **Daily check-in:** tap the notification (or ask Clio to start a check-in). Your mood and text go into today's note, then Clio asks a follow-up.
- **+ Note:** quick capture that works offline. A badge shows how many notes are waiting to sync.
- **Settings:** OpenRouter key and model, timezone, check-in times, notifications, and one-time import of the old numdum data from this browser.

### Privacy toggle

Diary entries (daily notes and journal entries) are marked `private: true`. Clio only retrieves past private entries when
you turn on **Share private diary with Clio this session** on the Chat tab; it is off again at every new sign-in.
What you type in the current conversation is always sent to the AI provider. Details: [docs/PRIVACY.md](docs/PRIVACY.md).

### How the chat works

Each tab keeps its own conversation thread, so what you say in Reminders does not mix with Diary or Notes. Clio answers with interactive cards (reminders, checklists, mood charts, forms) that you can act on directly. Clio cannot delete anything without your approval: deletions always show a confirmation card first.

## Your vault

The vault is a folder inside the `vault` volume:

```
Clio/Daily/YYYY-MM-DD.md       daily note (frontmatter: date, mood, energy, tags, private)
Clio/Notes/<slug>.md           notes and ideas (offline conflicts: <slug>.conflict-<id>.md)
Clio/Events/<date>-<id>.md     journal entries from the Journal view
Clio/Reminders/<id>.md         reminders (due, priority, repeat, done, ...)
Clio/Memory/Profile.md         facts Clio remembers about you (you can edit it)
Clio/Attachments/              reserved
```

Clio only **appends** to daily notes and **creates** new notes. It never rewrites your text without an approval card,
and a file Obsidian left with broken frontmatter is reported, never silently overwritten.

### Open it in Obsidian (Git or Syncthing)

The vault lives on the server, so desktop Obsidian needs a synced copy. Pick one:

**Git (recommended: history and visible conflicts).**
Create a private Git repository for the vault, then on the server:
```bash
docker compose exec clio-api sh -c 'cd /vault && git init -b main && git add -A && git commit -m "snapshot"'
```
Add a remote and push on a schedule (cron on the host running `docker compose exec`). On your desktop `git clone` the
repository and open that folder as an Obsidian vault (the Obsidian Git plugin can pull/push automatically).

**Syncthing.** Mount the `vault` volume into a Syncthing container (add it to `docker-compose.yml`) and share the folder with your desktop.

Edits made in Obsidian and in Clio at the same time can collide. Clio detects changes by file hash and keeps both versions
rather than overwriting; with Git you also see them as merge conflicts.

### Optional: Basic Memory

Set `MEMORY_BACKEND=basic-memory` and start the optional container with `docker compose --profile memory up -d`.
[Basic Memory](https://github.com/basicmachines-co/basic-memory) (AGPL-3.0, run unmodified) indexes the same markdown folder
and adds semantic search. It downloads an embedding model from huggingface.co on first use and its HTTP port has **no
authentication**, so it is only reachable inside the Docker network. If it is unreachable Clio falls back to its built-in
keyword search (`MEMORY_BACKEND=plain`, the default). Findings: [docs/superpowers/spikes/basic-memory.md](docs/superpowers/spikes/basic-memory.md).

## HTTPS

Put a reverse proxy with a certificate in front of port 4356. Example with Caddy:

```
clio.example.com {
    reverse_proxy localhost:4356
}
```

Set `CORS_ORIGIN=https://clio.example.com` and `TRUST_PROXY_HOPS=2` if the request passes through two proxies (default 1: nginx only).

## Configuration

One `.env` at the repository root. Compose also sets `API_PORT`, `VAULT_DIR` and `DATA_DIR` for the API container (you normally don't touch them).

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4356` | Public port of the web container |
| `TZ` | `UTC` | Your timezone; defines "today" and the check-in times (also editable in Settings) |
| `CLIO_PASSWORD` | required | Sign-in password (single owner) |
| `SECRET_KEY` | required | At least 32 characters; encrypts the saved OpenRouter key |
| `OPENROUTER_API_KEY` | — | Enables the chat; a key saved in Settings wins |
| `OPENROUTER_MODEL` | `openai/gpt-4o-mini` | Model id; pick one that supports tool calling |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Only for a proxy or tests |
| `MEMORY_BACKEND` | `plain` | `plain` or `basic-memory` |
| `BASIC_MEMORY_URL` | `http://basic-memory:8765/mcp` | Where the optional Basic Memory container listens |
| `VAPID_PUBLIC_KEY` | — | Web-push public key; without the VAPID pair no notifications are sent |
| `VAPID_PRIVATE_KEY` | — | Web-push private key |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact URI for the push service |
| `SESSION_TTL_HOURS` | `8` | How long a sign-in lasts |
| `CORS_ORIGIN` | none | Comma-separated allowed origins (only needed when the UI is on another origin) |
| `TRUST_PROXY_HOPS` | `1` | Number of proxies in front of the API (for per-IP rate limits) |
| `BACKUP_PASSPHRASE` | — | Passphrase for `scripts/backup.sh` / `restore.sh` |

Security defaults: 5 sign-in attempts per minute per IP and a 15-minute lockout after 5 failures, 10 chat requests per minute, request size caps, and no telemetry.

## Backups

```bash
BACKUP_PASSPHRASE='long passphrase' scripts/backup.sh ~/clio-backups
```
Writes one encrypted file with the vault and data volumes. Restore and details: [scripts/BACKUP_README.md](scripts/BACKUP_README.md).
Your notes are also plain markdown, so a Git remote or Syncthing copy of the vault is a second backup.

## Development

```bash
cd backend  && npm ci && npx vitest run     # API, vault, scheduler, sync, import
cd frontend && npm ci && npx vitest run     # UI, outbox, store
cd frontend && npm run dev                  # Vite on :5173, proxies /api to localhost:4000
bash scripts/test-backup.sh                 # backup/restore round trip
bash scripts/check-env-docs.sh              # README and .env.example list the same variables
```

Run the API locally: `cd backend && CLIO_PASSWORD=x SECRET_KEY=<32+ chars> VAULT_DIR=/tmp/v DATA_DIR=/tmp/d API_PORT=4000 node src/index.js`.

The frontend test suite has 17 known failures carried over from before the rewrite (`Stat`, `SnoozeSelector`, `analytics`,
`useAnalytics`, `ReminderList.filters`); they are unrelated to Clio's new code.

## Not ported / known gaps

- The old camera, contacts and map tabs are gone; the reminder form's contact and location pickers still work, but **photo attachments are not migrated** (large values are left out on import).
- Reminders reach you by web push from the server; the old in-browser alarm timers still exist and may show a second notification.
- Offline mode covers note capture only; chat, search and reminders need a connection.
- Semantic recall (Basic Memory) and real-OpenRouter tool calling were not verified by the automated tests.

## License

MIT. The optional Basic Memory container is AGPL-3.0 (unmodified, separate process).
