# Clio privacy notes

Clio is a single-owner, self-hosted app. You run it, you hold the data. This page says what is stored where, what
leaves your server, what is encrypted, and what is **not** protected. It is a technical description, not legal advice.

## What is stored, and where

| Data | Where | Protection |
|------|-------|------------|
| Notes, daily notes, journal, reminders, profile | `vault` volume, markdown files | **Plain text.** Encrypt the host disk/volume if you need encryption at rest. |
| OpenRouter API key | `data` volume (`settings.json`) | AES-256-GCM with a key derived from `SECRET_KEY`; never sent back to the browser |
| Push subscriptions, check-in state, sync receipts | `data` volume | Plain JSON (endpoints and ids, no note text) |
| Sign-in sessions | API process memory | Lost on restart; 8 hours by default |
| Notes written offline | Browser IndexedDB | AES-GCM-256, key derived (PBKDF2-SHA256, 210k rounds) from your password and kept only in memory |
| Backups | A file you choose | AES-256-CBC with PBKDF2, passphrase `BACKUP_PASSPHRASE` (no integrity check beyond a successful extract) |

The server **must** read your notes in plain text to search them and to let the AI use them. End-to-end encryption and
an AI that reads your notes cannot both hold.

## What leaves your server

- **To OpenRouter and the model provider you chose:** what you type in the chat, the system prompt, and the results of the
  tools the model calls (matching notes, reminders, what it just saved). Past **private** diary entries are included only
  while *Share private diary with Clio this session* is on. Anything sent there is subject to that provider's own policy.
- **To your browser's push service** (Google, Apple or Mozilla, depending on the browser): a Web Push message with the
  check-in text, or a reminder's title and the first 120 characters of its notes. The payload is encrypted for your browser;
  the push service still sees that a message was sent.
- **Nothing else.** CopilotKit telemetry and the dev inspector are disabled; the frontend loads no third-party scripts at runtime.
  (The optional Basic Memory container downloads an embedding model from huggingface.co on first use.)

## The "private" diary

Daily notes and journal entries are written with `private: true`. They are excluded from search results used by the AI
unless you share them for the session. Your own search in the app can include them. Notes Clio creates (`Clio/Notes`) and
the profile note are not private.

## Prompt injection

Text from your notes reaches the model only inside `<note_content>` tags with `<` and `>` escaped, and the system prompt
says it is data, not instructions. Clio has no tool that deletes or overwrites a note; deletion goes through a confirmation
card in the browser. This reduces, but cannot eliminate, the risk of a malicious note steering the model.

## Logs

If a call to the AI provider fails, the CopilotKit agent library writes the **whole request, including your messages**, to
the API container's error log. Compose limits that log to a few small files (`docker compose logs clio-api`), but treat it
as sensitive and do not share it.

## Access control

One password, a session token, a 15-minute lockout after 5 failed sign-ins, and rate limits. There are no accounts and no
roles. Anyone with the password has everything; anyone with access to the Docker host or the volumes reads the vault.

## Licences

Clio is MIT. The optional Basic Memory container is AGPL-3.0; Clio runs it unmodified as a separate process for your own use.
If you offer Clio to other people, review the AGPL obligations first.

## Deleting your data

Remove the volumes (`docker volume rm <project>_vault <project>_data`), revoke the OpenRouter key, and clear site data
in your browser (this removes the offline outbox and push subscription).
