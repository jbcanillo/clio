import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClioChat } from '../components/chat/ClioChat';
import { PageHeader } from '../components/layout/PageHeader';
import { ChecklistNote } from '../components/gen/ChecklistNote';
import { QuickNote } from '../components/QuickNote';
import { Chip } from '../components/ui/Chip';
import { Sheet } from '../components/ui/Sheet';
import { ClioActions } from '../copilot/actions';
import { apiFetch } from '../lib/api';
import { listNotes, toggleChecklist } from '../lib/clioApi';
import { useDataVersion } from '../lib/dataEvents';
import type { NoteSummary } from '../lib/types';
import { editNote, queuedNote, saveNote } from '../offline';
import { photoFromLine } from '../lib/media';

const CHIPS = [
  { label: 'Summarize my notes', prompt: 'Summarize my recent notes.' },
  { label: 'Turn a note into tasks', prompt: 'Pick one of my notes and turn it into a list of tasks or reminders.' },
];

function validTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function matches(n: NoteSummary, q: string): boolean {
  const hay = [n.title, n.snippet, ...n.tags, ...n.checklist.map((c) => c.text)];
  return hay.some((s) => (s ?? '').toLowerCase().includes(q));
}

export default function NotesPage() {
  const version = useDataVersion('notes');
  const location = useLocation();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<{ note: NoteSummary; loaded?: { title: string; text: string; photos: string[]; hash: string }; error?: string } | null>(null);
  const [tz, setTz] = useState('UTC');
  const [share, setShare] = useState(false);
  const [ask, setAsk] = useState<{ id: string; text: string } | undefined>(undefined);
  const askSeq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    apiFetch<{ timezone?: string }>('/api/settings')
      .then((s) => { if (live) setTz(validTimezone(s.timezone)); })
      .catch(() => { if (live) setTz('UTC'); });
    apiFetch<{ on?: boolean }>('/api/session/share')
      .then((r) => { if (live) setShare(r.on === true); })
      .catch(() => { if (live) setShare(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true; // last response wins
    listNotes()
      .then((n) => { if (live) { setNotes(n); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [version, retry]);

  // The shell keeps this page mounted, so react to the URL changing, then clear the param.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('focus') !== 'search') return;
    searchRef.current?.focus();
    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);

  const q = query.trim().toLowerCase();
  const searched = useMemo(() => (notes ?? []).filter((n) => !q || matches(n, q)), [notes, q]);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes ?? []) for (const t of new Set(n.tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()];
  }, [notes]);
  const activeTag = tag !== null && tags.some(([t]) => t === tag) ? tag : null;
  const visible = searched.filter((n) => activeTag === null || n.tags.includes(activeTag));

  const doAsk = () => {
    const text = query.trim();
    if (!text) return;
    askSeq.current += 1;
    setAsk({ id: String(askSeq.current), text });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (q && searched.length === 0) doAsk();
  };

  const toggle = useCallback(async (note: NoteSummary, index: number, checked: boolean) => {
    const res = await toggleChecklist(note.path, index, checked, note.hash);
    setNotes((cur) => (cur ? cur.map((n) => (n.path === note.path ? { ...n, hash: res.hash } : n)) : cur));
  }, []);

  const refetch = () => setRetry((n) => n + 1);

  const submitNote = async (note: { title: string; body: string }) => {
    await saveNote(note); // throws on failure: QuickNote shows its error and the sheet stays open
    setNewOpen(false); // saveNote / the outbox flush emit 'notes' once it reaches the server
  };

  const openEdit = async (note: NoteSummary) => {
    setEditing({ note });
    try {
      // A note that has not synced yet is edited where it waits, in the offline queue.
      const r = note.path.startsWith('pending:')
        ? await queuedNote(note.path)
        : await apiFetch<{ title: string | null; body: string; hash: string }>(`/api/notes/read?path=${encodeURIComponent(note.path)}`);
      const lines = r.body.replace(/\s+$/, '').split(/\r?\n/);
      const photos = lines.map(photoFromLine).filter((f): f is string => Boolean(f));
      const text = lines.filter((l) => !photoFromLine(l)).join('\n').trim();
      setEditing((cur) => (cur?.note.path === note.path ? { note, loaded: { title: r.title ?? note.title, text, photos, hash: r.hash } } : cur));
    } catch (e) {
      const msg = e instanceof TypeError ? "You're offline and this note isn't saved on this device yet." : "Couldn't open that note.";
      setEditing((cur) => (cur?.note.path === note.path ? { note, error: msg } : cur));
    }
  };
  const saveEdit = async (n: { title: string; body: string }) => {
    if (!editing?.loaded) return;
    await editNote({ path: editing.note.path, baseHash: editing.loaded.hash, title: n.title, body: n.body }); // throws: QuickNote shows it
    setEditing(null);
  };

  const loading = notes === null && !error;
  const empty = notes !== null && notes.length === 0;

  return (
    <section aria-label="Notes" className="px-4 py-4">
      <PageHeader
        title="Notes"
        subtitle="Your thoughts, ideas and checklists in one place. Search them, filter by tag, or ask Clio about them."
        action={
          <button
            type="button"
            aria-label="New note"
            onClick={() => setNewOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ember text-xl font-bold text-white"
          >
            <span aria-hidden="true">+</span>
          </button>
        }
      />
      <div className="flex items-center gap-2 rounded-full border border-hairline bg-card py-1 pl-4 pr-1 shadow-card">
        <label htmlFor="notes-search" className="sr-only">Search notes</label>
        <input
          id="notes-search"
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search notes or ask AI…"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <button
          type="button"
          aria-label="Ask Clio"
          onClick={doAsk}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember text-white"
        >
          <Search aria-hidden="true" size={16} />
        </button>
      </div>

      {notes !== null && notes.length > 0 ? (
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip tone="teal" selected={activeTag === null} onClick={() => setTag(null)}>{`All ${notes.length}`}</Chip>
          {tags.map(([t, n]) => (
            <Chip key={t} selected={activeTag === t} onClick={() => setTag(activeTag === t ? null : t)}>{`${t} ${n}`}</Chip>
          ))}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-error/30 bg-error/10 p-3 text-sm text-error">
          <span>Couldn&apos;t load your notes.</span>
          <button type="button" className="rounded-full border border-error/40 px-3 py-1 text-xs font-semibold" onClick={refetch}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div aria-busy="true" aria-label="Loading notes" className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-inset" />)}
        </div>
      ) : null}

      {empty && !error ? (
        <div className="mt-4 rounded-2xl border border-hairline bg-card p-6 text-center">
          <p className="text-sm text-ink-soft">No notes yet</p>
        </div>
      ) : null}

      {notes !== null && !empty && visible.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">No matching notes.</p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {visible.map((n) => (
            <li key={n.path}>
              <ChecklistNote note={n} onToggle={(i, c) => toggle(n, i, c)} onConflict={refetch} onEdit={() => void openEdit(n)} />
            </li>
          ))}
        </ul>
      ) : null}

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="New note">
        <QuickNote onSave={submitNote} />
      </Sheet>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Edit note">
        {editing?.loaded ? (
          <QuickNote key={editing.note.path} initial={editing.loaded} onSave={saveEdit} submitLabel="Save changes" onCancel={() => setEditing(null)} />
        ) : editing && !editing.error ? (
          <div aria-busy="true" aria-label="Loading note" className="h-40 animate-pulse rounded-2xl bg-inset" />
        ) : null}
        {editing?.error ? <p role="alert" className="mt-2 text-sm text-error">{editing.error}</p> : null}
      </Sheet>

      <div className="mt-6">
        <ClioActions scope="notes" shareOn={share} timezone={tz} />
        <ClioChat
          scope="notes"
          mode="sheet"
          placeholder="Ask about your notes…"
          chips={CHIPS}
          sheetTitle="Clio"
          pendingPrompt={ask}
        />
      </div>
    </section>
  );
}
