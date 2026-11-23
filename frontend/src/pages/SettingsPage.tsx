import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { ImportLegacy } from '../components/features/ImportLegacy';
import { registerPush } from '../lib/push';

interface Settings {
  openrouterKeySet: boolean;
  openrouterModel: string;
  timezone: string;
  checkinTimes: { morning: string; evening: string };
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [message, setMessage] = useState('');
  const [keyTest, setKeyTest] = useState('');
  const [pushState, setPushState] = useState('');

  useEffect(() => { apiFetch<Settings>('/api/settings').then(setS).catch(() => setMessage('Could not load settings.')); }, []);
  if (!s) return <p className="p-4">{message || 'Loading…'}</p>;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!s) return;
    try {
      const updated = await apiFetch<Settings>('/api/settings', {
        method: 'PUT',
        json: { timezone: s.timezone, openrouterModel: s.openrouterModel, checkinTimes: s.checkinTimes, ...(keyInput ? { openrouterKey: keyInput } : {}) },
      });
      setS(updated);
      setKeyInput('');
      setMessage('Saved.');
    } catch {
      setMessage("Couldn't save. Check the timezone and times.");
    }
  }

  async function testKey() {
    const r = await apiFetch<{ ok: boolean; error?: string }>('/api/settings/test-key', { method: 'POST' });
    setKeyTest(r.ok ? 'Key works.' : `Key test failed: ${r.error}`);
  }

  return (
    <form onSubmit={save} className="p-4 space-y-4 max-w-lg mx-auto">
      <h2 className="text-xl font-semibold">Settings</h2>

      <section className="space-y-2">
        <h3 className="font-medium">AI (OpenRouter)</h3>
        <label className="block text-sm">
          OpenRouter API key
          <input className="input input-bordered w-full mt-1" type="password" autoComplete="off" value={keyInput}
                 placeholder={s.openrouterKeySet ? '•••••••• (leave empty to keep)' : 'sk-or-…'} onChange={(e) => setKeyInput(e.target.value)} />
        </label>
        {s.openrouterKeySet && <p className="text-xs opacity-70">Key saved on the server. It is never shown again.</p>}
        <label className="block text-sm">
          Model
          <input className="input input-bordered w-full mt-1" value={s.openrouterModel} onChange={(e) => setS({ ...s, openrouterModel: e.target.value })} />
        </label>
        <button type="button" className="btn btn-sm" onClick={testKey}>Test key</button>
        {keyTest && <p className="text-sm">{keyTest}</p>}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Daily reminders to write</h3>
        <label className="block text-sm">
          Timezone
          <input className="input input-bordered w-full mt-1" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} />
        </label>
        <label className="block text-sm">
          Morning reminder
          <input className="input input-bordered w-full mt-1" type="time" value={s.checkinTimes.morning}
                 onChange={(e) => setS({ ...s, checkinTimes: { ...s.checkinTimes, morning: e.target.value } })} />
        </label>
        <label className="block text-sm">
          Evening reminder (only if you haven't written yet)
          <input className="input input-bordered w-full mt-1" type="time" value={s.checkinTimes.evening}
                 onChange={(e) => setS({ ...s, checkinTimes: { ...s.checkinTimes, evening: e.target.value } })} />
        </label>
        <button type="button" className="btn btn-sm" onClick={async () => setPushState(await registerPush())}>Enable notifications</button>
        {pushState && <p className="text-sm">Notifications: {pushState}</p>}
      </section>

      <button className="btn btn-primary" type="submit">Save settings</button>
      {message && <p role="status" className="text-sm">{message}</p>}
      <ImportLegacy />
    </form>
  );
}
