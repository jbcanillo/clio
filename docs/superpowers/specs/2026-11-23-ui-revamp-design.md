# Clio UI/UX revamp — design

Date: 2026-11-23 · Status: awaiting approval · Size: project

## Intent
Restyle Clio to the Symbiosis mockups in `docs/ui/` (`DESIGN.md` plus four screens) using the **teal + orange** scheme everywhere, and make
**CopilotKit generative UI the core way the owner interacts**: Clio answers with live, interactive cards, not plain text.
Why: the current app is a purple "galaxy" theme with five tabs (Chat, Calendar, List, Stats, Settings) where generative UI is a few read-only cards
inside a stock `CopilotChat`. The owner wants the app to feel AI-native and to follow the mockups.

## Goals
- Four tabs, as in the mockups: **Chat**, **Diary**, **Reminders**, **Notes**. Chat is the all-purpose hub (every action).
- Every tab has its **own chat bar and its own conversation thread** (Diary: "Reflect with Clio…", Reminders: "Remind me to…", Notes: search/ask AI).
  A tab's bar knows that tab's context and offers that tab's suggestion chips.
- Generative cards are **interactive**, not just displayed: complete/snooze a reminder, tick checklist items, edit a note inline,
  accept/keep a reschedule suggestion, rate a mood, approve a draft. One shared card set, used in chat threads *and* in the tab screens.
- Teal `#0D4C55/#146B78/#072B30`, orange `#FF6B35/#FA824C/#FFE8DF`, neutrals and elevation levels from `DESIGN.md`. Plus Jakarta Sans + Inter.
  Orange is reserved for AI/action elements; teal for structure. Light theme matches the mockups; a dark teal theme is kept (the app has a dark toggle today).
- Settings, Backup/Restore, import and install prompt move behind the avatar/menu in the header.

## Non-goals / anti-goals
- **No speech-to-text or voice**: no mic buttons, no voice-memo/waveform cards (stack can't support it).
- Not building what the mockups imply but the backend lacks: photos/images, book covers, "multi-agent sync", Google Calendar sync, "AI living document" synthesis,
  avatar photos. These are omitted or shown as static placeholders only if cheap; never faked as working.
- Not changing the existing security model: Clio still cannot delete/overwrite; destructive actions stay behind approval cards;
  note text must not flow back to the model through tool results (cards load their own data).
- Anti-goal: a restyle where the chat is still a stock CopilotKit widget with the old look.

## Constraints
- CopilotKit pinned to 1.90.0 (`@copilotkit/react-core`, `react-ui`); backend uses the v2 `BuiltInAgent` with one agent `default`; client uses single-route protocol.
- React 18, Tailwind 3 + daisyUI 5, Vite, Vitest. Existing frontend tests must keep passing or be updated with the code they cover.
- Existing hooks/offline stack (outbox, `saveNote`, sync conflicts) stays; the UI reuses it.
- Mobile-first single column; two-pane on tablet+ (per `DESIGN.md`).

## Approaches considered (per-tab chat)
- **A. One shared thread** tagged with tab context. Simple, but Chat fills with tab-specific chatter. Rejected.
- **B. Separate thread per tab (chosen).** Own history, own context/chips/actions per tab; Chat tab has all actions. More work; relies on per-thread support (see risks).
- **C. Tab bars forward to Chat.** Cheapest, but tabs don't really have chat. Rejected.

## Design

### Theme layer
Replace `index.css` galaxy variables and `tailwind.config.cjs` colors with Symbiosis tokens (surface levels 0–3, teal/orange scales, radii, shadows per `DESIGN.md`).
Define two daisyUI themes (`clio-light`, `clio-dark`) and set `data-theme` from the dark toggle (today `main.tsx` hardcodes `luxury`, which fights the custom theme).
Remove galaxy effects (`useGalaxyEffects`, twinkle, stellar-shine buttons). Load Plus Jakarta Sans + Inter in `index.html`.

### Shell
Header: Clio wordmark, "AI Core" status pill (online/offline/pending-sync from `useOnlineSync`), search, avatar menu (Settings, Backup/Restore, Import, theme, notifications, install).
Bottom nav: Chat, Diary, Reminders, Notes (icons as in mockups; active = teal pill). Routes: `/chat`, `/diary`, `/reminders`, `/notes`, `/settings`.
The existing add-reminder/add-journal pages become secondary flows reachable from the tabs (and remain valid fallback forms), but the primary create path is the tab's chat.

### Chat engine (the core)
- `ClioChat` component built on `useCopilotChat` (headless), replacing `CopilotChat`: message list (user bubbles teal, Clio text + "AI Synthesized" pill),
  suggestion chips, composer bar with attach-free text input and send. Generative card render is inline in the message stream, using the existing `useCopilotAction` `render` / `renderAndWaitForResponse`.
- One `CopilotKit` provider per tab *thread*: each tab mounts `<ClioChat scope="diary|reminders|notes|chat" />` with its own `threadId`, persisted so history survives navigation/reload.
  Per-tab context via `useCopilotReadable` (selected date, filter, open note…). Actions are registered per scope: Chat registers all; each tab registers its own subset.
- Backend: keep one agent; add the new server tools below; extend the system prompt with a short per-scope hint sent from the client as readable context (not trusted for authorization — no new privileges come from it).

### Generative card set (`components/gen/`, shared by chat and tabs)
Existing: ReminderCards, MoodChart, SearchResults, NotePreview, ConfirmCard, CheckinForm, ConflictCard — restyled and made interactive where noted.
New:
- **ReminderCard** — priority/due chips, complete toggle (circular, spring), snooze menu, delete via approval. Orange ring for overdue/high priority.
- **RescheduleSuggestion** — "AI context engine" card with Accept / Keep original (`renderAndWaitForResponse`; accept calls reminder update).
- **ChecklistNote** — note card with tags and checklist items that tick/untick and persist; "Open in Notes".
- **DiaryReflection** — day card with mood chip, text, "Expand / Edit tone"; weekly reflection card with entries/avg mood/dominant focus stats (computed from daily notes).
- **MoodTimeline** — the mood chart restyled in teal/orange.
- **AiActionBox** — orange-tinted container of one-tap follow-ups ("Convert to 3 tasks", "Schedule reminder for 9:00 AM") that send a message or call an action.
New client actions: `show_diary`, `show_note`, `propose_reschedule`, `propose_tasks`, `show_reflection` (render-only, self-loading like today's `show_*`).

### Tab screens
- **Chat:** thread + chips ("Reflect on today's wins", "Set workout reminder") + composer; quick-note and share-with-Clio toggle move into a compact toolbar/sheet; sync conflicts show as a card.
- **Diary:** month/week strip with per-day mood dots (replaces Calendar tab), weekly reflection card, timeline log of daily notes and legacy journal entries, own chat bar ("Reflect with Clio").
- **Reminders:** "Today's Horizons" header, filter pills (All / Due today / AI suggested), AI suggestion card, High-priority and other groups, Completed today, daily-rhythm progress bar (completed vs due today), own chat bar. Stats content folds into the Diary reflection and this progress bar.
- **Notes:** search-or-ask bar, tag filter pills, note cards with checklists, "New note" button (opens the Notes chat / quick note). Own thread.

### Backend additions (small)
- `GET /api/notes` — list notes under `Clio/Notes` (title, tags, snippet, updated, checklist items parsed from markdown) for the Notes tab and `show_note`. Private/diary notes excluded.
- `GET /api/daily?from&to` — range of daily-note summaries (mood, energy, headline text) for the Diary strip/timeline/weekly stats.
- Checklist toggle: reuse vault write with `expectedHash` via a `PATCH /api/notes/:id/checklist` (or the existing sync path) so conflicts are detected as today.
Tests alongside each (Vitest), following existing controller tests.

## Testing
Component tests for each card and the `ClioChat` render path (Testing Library, mocking `useCopilotChat`); update affected existing tests (BottomNavigation, ChatPage, Dashboard/Stat/CalendarView as they are replaced);
backend tests for the new endpoints; `npm run typecheck` and `npm test` in both packages; a manual pass in the browser at mobile and desktop widths in light and dark.

## Risks / unverified
- **Per-thread conversations in CopilotKit 1.90** (a `threadId` per provider/chat) is an assumption; `frontend/node_modules` isn't installed so it is unchecked. First plan task: install and prove it with a throwaway spike. Fallback: one provider with per-scope message filtering and a scope tag on messages (still B from the user's view).
- Interactive cards must keep the rule that note text never goes to the model via tool results — cards fetch their own data.
- The existing legacy components (ReminderList, CalendarView, journal forms) have tests; deleting vs. keeping them as fallbacks is left to the builder, preferring deletion of dead code once the new tabs cover them.
- Dark theme: mockups are light only; the dark palette is my derivation from the teal scale.

## Left to the builder
Exact component file layout, animation details, chip wording, icon choices, how thread ids are stored (localStorage vs. server), and the weekly-reflection stat formulas.
