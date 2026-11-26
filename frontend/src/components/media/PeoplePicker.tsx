import { BookUser, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import type { Person } from '../../lib/types';

/** The Contact Picker API (Chrome on Android). Other browsers don't let web apps read the address book. */
interface ContactsManager {
  select(props: string[], opts?: { multiple?: boolean }): Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
}
const contactsApi = (): ContactsManager | null => {
  const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { contacts?: ContactsManager }) : null;
  return nav?.contacts && typeof nav.contacts.select === 'function' ? nav.contacts : null;
};
export const deviceContactsSupported = () => contactsApi() !== null;

interface Props {
  value: Person[];
  onChange: (next: Person[]) => void;
  /** One person only (reminders); several for check-ins. */
  single?: boolean;
}

export function PeoplePicker({ value, onChange, single = false }: Props) {
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState<Person>({ name: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const api = contactsApi();

  const add = (people: Person[]) => {
    const clean = people
      .map((p) => ({ name: p.name.trim(), ...(p.phone?.trim() ? { phone: p.phone.trim() } : {}), ...(p.email?.trim() ? { email: p.email.trim() } : {}) }))
      .filter((p) => p.name);
    if (!clean.length) return;
    onChange(single ? clean.slice(0, 1) : [...value, ...clean.filter((p) => !value.some((v) => v.name === p.name && v.phone === p.phone))]);
  };

  const fromDevice = async () => {
    if (!api) return;
    setError('');
    try {
      const picked = await api.select(['name', 'tel', 'email'], { multiple: !single });
      add(picked.map((c) => ({ name: c.name?.[0] ?? c.tel?.[0] ?? c.email?.[0] ?? '', phone: c.tel?.[0], email: c.email?.[0] })));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError("Couldn't open your contacts.");
    }
  };

  const saveManual = () => {
    if (!form.name.trim()) {
      setError('Enter a name.');
      return;
    }
    add([form]);
    setForm({ name: '', phone: '', email: '' });
    setManual(false);
    setError('');
  };

  const field = 'w-full rounded-lg border border-hairline bg-inset px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal';

  return (
    <div className="space-y-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((p, i) => (
            <li key={`${p.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-inset py-1 pl-3 pr-1 text-xs text-ink">
              <span className="font-semibold">{p.name}</span>
              {p.phone || p.email ? <span className="text-ink-muted">{p.phone || p.email}</span> : null}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-card">
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {single && value.length ? null : (
        <div className="flex flex-wrap gap-2">
          {api ? (
            <button type="button" onClick={() => void fromDevice()} className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-inset">
              <BookUser aria-hidden="true" size={14} /> From contacts
            </button>
          ) : null}
          <button type="button" onClick={() => setManual((m) => !m)} aria-expanded={manual} className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-inset">
            <UserPlus aria-hidden="true" size={14} /> {api ? 'Type a name' : 'Add person'}
          </button>
        </div>
      )}
      {manual ? (
        <div className="space-y-2 rounded-xl border border-hairline p-3">
          <label className="block text-xs text-ink-soft">Name
            <input className={`${field} mt-1`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-ink-soft">Phone
              <input className={`${field} mt-1`} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="block text-xs text-ink-soft">Email
              <input className={`${field} mt-1`} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setManual(false); setError(''); }}>Cancel</button>
            <button type="button" className="btn btn-xs border-0 bg-teal text-on-teal" onClick={saveManual}>Add</button>
          </div>
        </div>
      ) : null}
      {!api && !manual && !value.length ? (
        <p className="text-[11px] text-ink-muted">This browser can't open your phone's contacts (only Chrome on Android can), so type the name instead.</p>
      ) : null}
      {error ? <p role="alert" className="text-xs text-error">{error}</p> : null}
    </div>
  );
}
