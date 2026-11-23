import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import remindersDB, { getAllJournalEntries } from '../../utils/db';

interface ImportResult { reminders: number; journals: number; skipped: number; dropped: number }

/** One-time import of what the old numdum stored in this browser (IndexedDB) into the vault. Safe to repeat. */
export function ImportLegacy() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const [reminders, journals] = await Promise.all([remindersDB.getAllReminders(), getAllJournalEntries()]);
      if (reminders.length === 0 && journals.length === 0) {
        setMessage('Nothing to import: no old data found in this browser.');
        return;
      }
      const r = await apiFetch<ImportResult>('/api/import/numdum', { method: 'POST', json: { reminders, journals } });
      const extra = [r.skipped ? `${r.skipped} skipped` : '', r.dropped ? `${r.dropped} large attachments left out` : ''].filter(Boolean).join(', ');
      setMessage(`Imported ${r.reminders} reminders and ${r.journals} journal entries.${extra ? ` (${extra})` : ''}`);
    } catch {
      setError("Couldn't import. Check that you are signed in and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="font-medium">Import from the old numdum</h3>
      <p className="text-xs opacity-70">Copies reminders and journal entries stored in this browser into your vault. Running it again does not create duplicates.</p>
      <button type="button" className="btn btn-sm" onClick={run} disabled={busy}>Import old data</button>
      {message && <p role="status" className="text-sm">{message}</p>}
      {error && <p role="alert" className="text-error text-sm">{error}</p>}
    </section>
  );
}
