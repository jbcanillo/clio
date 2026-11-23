import { useCopilotChat } from '@copilotkit/react-core';
import { Role, TextMessage } from '@copilotkit/runtime-client-gql';
import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { useEffect, useState } from 'react';
import { CheckinForm, type CheckinValues } from '../components/gen/CheckinForm';
import { ClioActions, saveCheckin } from '../copilot/actions';
import { ConflictList } from '../components/ConflictList';
import { QuickNote } from '../components/QuickNote';
import { apiFetch } from '../lib/api';
import { outbox, saveNote } from '../offline';
import { useOnlineSync } from '../offline/useOnlineSync';
import { todayIn } from '../lib/today';

function ShareToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="label cursor-pointer gap-2 text-xs">
      <span>Share private diary with Clio this session</span>
      <input
        type="checkbox"
        className="toggle toggle-sm"
        checked={on}
        onChange={(e) => {
          const next = e.target.checked;
          apiFetch('/api/session/share', { method: 'POST', json: { on: next } }).then(() => onChange(next)).catch(() => {});
        }}
      />
    </label>
  );
}

export default function ChatPage() {
  const [shareOn, setShareOn] = useState(false);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [checkin, setCheckin] = useState(() => new URLSearchParams(window.location.search).get('checkin') === '1');
  const [error, setError] = useState('');
  const [showNote, setShowNote] = useState(false);
  const { appendMessage } = useCopilotChat();
  const { pending, conflicts, resolved } = useOnlineSync(outbox);

  useEffect(() => {
    apiFetch<{ on: boolean }>('/api/session/share').then((r) => setShareOn(r.on)).catch(() => {});
    apiFetch<{ timezone: string }>('/api/settings').then((s) => setTimezone(s.timezone)).catch(() => setTimezone('UTC'));
    // The notification link is one-shot: drop ?checkin=1 so a reload does not reopen it.
    if (window.location.search.includes('checkin=')) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }, []);

  async function submit(v: CheckinValues) {
    setError('');
    try {
      await saveCheckin(todayIn(timezone ?? 'UTC'), v);
    } catch {
      setError("Couldn't save your check-in. Please try again.");
      return;
    }
    setCheckin(false);
    appendMessage(new TextMessage({ role: Role.User, content: `I just finished my check-in. Mood: ${v.mood}/5.` }));
  }

  async function skip() {
    setCheckin(false);
    await apiFetch('/api/checkin/snooze', { method: 'POST' }).catch(() => {});
  }

  return (
    <section className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <button className="btn btn-xs" onClick={() => setShowNote((v) => !v)}>{showNote ? 'Close' : '+ Note'}</button>
          {pending > 0 && <span className="badge badge-sm">{pending} waiting to sync</span>}
        </div>
        <ShareToggle on={shareOn} onChange={setShareOn} />
      </div>
      {showNote && <div className="px-2 pb-2"><QuickNote onSave={saveNote} /></div>}
      <ConflictList conflicts={conflicts} onResolved={resolved} />
      <ClioActions shareOn={shareOn} timezone={timezone ?? 'UTC'} />
      {checkin && timezone && (
        <div className="px-2 pb-2">
          <CheckinForm onSubmit={submit} onSkip={skip} />
          {error && <p role="alert" className="text-error text-sm mt-1">{error}</p>}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <CopilotChat labels={{ title: 'Clio', initial: "Hi, I'm Clio. How was your day? You can tell me what happened, a thought, an idea, or ask me to remind you of something." }} />
      </div>
    </section>
  );
}
