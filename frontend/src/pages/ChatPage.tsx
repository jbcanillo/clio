import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { useEffect, useState } from 'react';
import { ClioActions } from '../copilot/actions';
import { apiFetch } from '../lib/api';

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
  useEffect(() => {
    apiFetch<{ on: boolean }>('/api/session/share').then((r) => setShareOn(r.on)).catch(() => {});
  }, []);

  return (
    <section className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex justify-end"><ShareToggle on={shareOn} onChange={setShareOn} /></div>
      <ClioActions shareOn={shareOn} />
      <div className="flex-1 min-h-0">
        <CopilotChat labels={{ title: 'Clio', initial: "Hi, I'm Clio. How was your day? You can tell me what happened, a thought, an idea, or ask me to remind you of something." }} />
      </div>
    </section>
  );
}
