import { FormEvent, useEffect, useState } from 'react';
import { Bell, DatabaseBackup, Import, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/layout/Panel';
import { apiFetch } from '../lib/api';
import { failureReason } from '../lib/keyStatus';
import { ImportLegacy } from '../components/features/ImportLegacy';
import { ModelPicker } from '../components/features/ModelPicker';
import { BackupRestore } from '../components/features/BackupRestore';
import { registerPush } from '../lib/push';

interface Settings {
  openrouterKeySet: boolean;
  openrouterModel: string;
  timezone: string;
  checkinTimes: { morning: string; evening: string };
}

type Patch = Partial<Pick<Settings, 'openrouterModel' | 'timezone' | 'checkinTimes'>> & { openrouterKey?: string };

const field = 'input input-bordered w-full mt-1';

export default function SettingsPage({ onToast }: { onToast?: (msg: string, type: string) => void } = {}) {
  const [s, setS] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [checkinMessage, setCheckinMessage] = useState('');
  const [keyTest, setKeyTest] = useState('');
  const [pushState, setPushState] = useState('');

  useEffect(() => { apiFetch<Settings>('/api/settings').then(setS).catch(() => setLoadError('Could not load settings.')); }, []);

  /** Each panel saves only its own fields, so unsaved edits in another panel are left alone. */
  async function put(patch: Patch): Promise<Settings> {
    const updated = await apiFetch<Settings>('/api/settings', { method: 'PUT', json: patch });
    setS((cur) => (cur ? { ...cur, openrouterKeySet: updated.openrouterKeySet, ...patchView(updated, patch) } : updated));
    return updated;
  }
  const patchView = (u: Settings, p: Patch): Partial<Settings> => ({
    ...(p.openrouterModel !== undefined ? { openrouterModel: u.openrouterModel } : {}),
    ...(p.timezone !== undefined ? { timezone: u.timezone } : {}),
    ...(p.checkinTimes !== undefined ? { checkinTimes: u.checkinTimes } : {}),
  });

  async function saveAi(e: FormEvent) {
    e.preventDefault();
    if (!s) return;
    try {
      await put({ openrouterModel: s.openrouterModel, ...(keyInput ? { openrouterKey: keyInput } : {}) });
      setKeyInput('');
      setAiMessage('Saved.');
    } catch {
      setAiMessage("Couldn't save the AI settings.");
    }
  }

  async function saveCheckins(e: FormEvent) {
    e.preventDefault();
    if (!s) return;
    try {
      await put({ timezone: s.timezone, checkinTimes: s.checkinTimes });
      setCheckinMessage('Saved.');
    } catch {
      setCheckinMessage("Couldn't save. Check the timezone and times.");
    }
  }

  async function testKey() {
    const r = await apiFetch<{ ok: boolean; error?: string }>('/api/settings/test-key', { method: 'POST' });
    setKeyTest(r.ok ? 'Key and model work.' : `${failureReason(r) ?? 'Key test failed.'} (${r.error})`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <PageHeader title="Settings" subtitle="Your AI connection, daily check-ins, backups and imports." className="mb-2" />

      {!s ? (
        <p className="p-4">{loadError || 'Loading…'}</p>
      ) : (
        <>
          <Panel title="AI (OpenRouter)" icon={<Sparkles size={18} />} description="The key and model Clio uses to chat. The key stays on your server.">
            <form onSubmit={saveAi} className="space-y-3">
              <label className="block text-sm">
                OpenRouter API key
                <input className={field} type="password" autoComplete="off" value={keyInput}
                       placeholder={s.openrouterKeySet ? '•••••••• (leave empty to keep)' : 'sk-or-…'} onChange={(e) => { setKeyInput(e.target.value); setAiMessage(''); }} />
              </label>
              {s.openrouterKeySet && <p className="text-xs opacity-70">Key saved on the server. It is never shown again.</p>}
              <ModelPicker value={s.openrouterModel} onChange={(id) => { setS({ ...s, openrouterModel: id }); setAiMessage(''); }} />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" className="btn btn-sm" onClick={testKey}>Test key and model</button>
                <button className="btn btn-primary btn-sm" type="submit">Save AI settings</button>
              </div>
              {keyTest && <p className="text-sm">{keyTest}</p>}
              {aiMessage && <p role="status" className="text-sm">{aiMessage}</p>}
            </form>
          </Panel>

          <Panel title="Daily check-ins" icon={<Bell size={18} />} description="When Clio nudges you to write, in your time zone.">
            <form onSubmit={saveCheckins} className="space-y-3">
              <label className="block text-sm">
                Timezone
                <input className={field} value={s.timezone} onChange={(e) => { setS({ ...s, timezone: e.target.value }); setCheckinMessage(''); }} />
              </label>
              <label className="block text-sm">
                Morning reminder
                <input className={field} type="time" value={s.checkinTimes.morning}
                       onChange={(e) => { setS({ ...s, checkinTimes: { ...s.checkinTimes, morning: e.target.value } }); setCheckinMessage(''); }} />
              </label>
              <label className="block text-sm">
                Evening reminder (only if you haven't written yet)
                <input className={field} type="time" value={s.checkinTimes.evening}
                       onChange={(e) => { setS({ ...s, checkinTimes: { ...s.checkinTimes, evening: e.target.value } }); setCheckinMessage(''); }} />
              </label>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" className="btn btn-sm" onClick={async () => setPushState(await registerPush())}>Enable notifications</button>
                <button className="btn btn-primary btn-sm" type="submit">Save check-in settings</button>
              </div>
              {pushState && <p className="text-sm">Notifications: {pushState}</p>}
              {checkinMessage && <p role="status" className="text-sm">{checkinMessage}</p>}
            </form>
          </Panel>
        </>
      )}

      <Panel id="backup" title="Backup & restore" icon={<DatabaseBackup size={18} />} description="An encrypted copy of everything in Clio, and a way to bring it back.">
        <BackupRestore onToast={onToast} />
      </Panel>

      <Panel title="Import from the old numdum" icon={<Import size={18} />}>
        <ImportLegacy />
      </Panel>
    </div>
  );
}
