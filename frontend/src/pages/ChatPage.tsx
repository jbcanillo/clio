import { useCopilotChatInternal } from '@copilotkit/react-core';
import { useEffect, useState } from 'react';
import { ClioChat, type ClioChatChip } from '../components/chat/ClioChat';
import { ConflictList } from '../components/ConflictList';
import { CheckinForm, type CheckinValues } from '../components/gen/CheckinForm';
import { QuickNote } from '../components/QuickNote';
import { Sheet } from '../components/ui/Sheet';
import { ClioActions, saveCheckin } from '../copilot/actions';
import { apiFetch } from '../lib/api';
import { todayIn } from '../lib/today';
import { newUuid } from '../lib/uuid';
import { outbox, saveNote } from '../offline';
import { useOnlineSync } from '../offline/useOnlineSync';

const CHIPS: ClioChatChip[] = [
  { label: "Reflect on today's wins", prompt: "Help me reflect on today's wins." },
  { label: 'Set a workout reminder', prompt: 'Set a workout reminder for me.' },
  { label: "What's on my plate?", prompt: "What's on my plate today?" },
];

const GREETING =
  "Hi, I'm Clio. How was your day? You can tell me what happened, a thought, an idea, or ask me to remind you of something.";

function validTimezone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export default function ChatPage() {
  const [shareOn, setShareOn] = useState(false);
  const [shareError, setShareError] = useState('');
  const [timezone, setTimezone] = useState<string | null>(null);
  const [checkin, setCheckin] = useState(() => new URLSearchParams(window.location.search).get('checkin') === '1');
  const [error, setError] = useState('');
  const [showNote, setShowNote] = useState(false);
  const { sendMessage } = useCopilotChatInternal();
  const { pending, conflicts, resolved } = useOnlineSync(outbox);

  useEffect(() => {
    apiFetch<{ on: boolean }>('/api/session/share').then((r) => setShareOn(r.on)).catch(() => {});
    apiFetch<{ timezone: string }>('/api/settings')
      .then((s) => setTimezone(validTimezone(s.timezone)))
      .catch(() => setTimezone('UTC'));
    // The notification link is one-shot: drop ?checkin=1 so a reload does not reopen it.
    if (window.location.search.includes('checkin=')) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }, []);

  async function toggleShare(next: boolean) {
    setShareError('');
    try {
      await apiFetch('/api/session/share', { method: 'POST', json: { on: next } });
      setShareOn(next);
    } catch {
      setShareError("Couldn't update sharing. Please try again.");
    }
  }

  async function submit(v: CheckinValues) {
    setError('');
    try {
      await saveCheckin(todayIn(timezone ?? 'UTC'), v);
    } catch {
      setError("Couldn't save your check-in. Please try again.");
      return;
    }
    setCheckin(false);
    void sendMessage({ id: newUuid(), role: 'user', content: `I just finished my check-in. Mood: ${v.mood}/5.` });
  }

  async function skip() {
    setCheckin(false);
    await apiFetch('/api/checkin/snooze', { method: 'POST' }).catch(() => {});
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-2">
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-xs" onClick={() => setShowNote(true)}>+ Note</button>
          {pending > 0 && <span className="badge badge-sm">{pending} waiting to sync</span>}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
          <span>Share private diary with Clio this session</span>
          <input
            type="checkbox"
            role="switch"
            className="toggle toggle-sm"
            checked={shareOn}
            onChange={(e) => void toggleShare(e.target.checked)}
          />
        </label>
      </div>
      {shareError && <p role="alert" className="shrink-0 px-4 text-sm text-error">{shareError}</p>}
      <Sheet open={showNote} onClose={() => setShowNote(false)} title="Quick note">
        <QuickNote
          onSave={async (n) => {
            await saveNote(n);
            setShowNote(false);
          }}
        />
      </Sheet>
      <div className="shrink-0">
        <ConflictList conflicts={conflicts} onResolved={resolved} />
      </div>
      <ClioActions scope="chat" shareOn={shareOn} timezone={timezone ?? 'UTC'} />
      {checkin && timezone && (
        <div className="shrink-0 px-4 pb-2">
          <CheckinForm onSubmit={submit} onSkip={skip} />
          {error && <p role="alert" className="mt-1 text-sm text-error">{error}</p>}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ClioChat
          scope="chat"
          mode="full"
          placeholder="Talk, type, or brainstorm…"
          chips={CHIPS}
          empty={<p className="text-sm text-ink-soft">{GREETING}</p>}
        />
      </div>
    </section>
  );
}
