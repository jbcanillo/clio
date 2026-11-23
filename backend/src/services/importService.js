const PRIORITIES = ['low', 'medium', 'high'];
const REPEATS = ['never', 'daily', 'weekly', 'monthly', 'yearly'];
const REMINDER_KNOWN = new Set(['id', 'title', 'description', 'dueDate', 'priority', 'repeat', 'completed', 'completed_at', 'created_at', 'snoozedUntil']);
const JOURNAL_KNOWN = new Set(['id', 'text', 'mood', 'createdAt']);
const MAX_FIELD_CHARS = 5000; // larger embedded values (photos as data URLs) are dropped

const validDate = (v) => v !== undefined && v !== null && !Number.isNaN(new Date(v).getTime());

/** Splits unknown legacy fields into small extras, counting the oversized ones it drops. */
function extrasOf(obj, known) {
  const extras = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (known.has(k)) continue;
    if (JSON.stringify(v ?? null).length > MAX_FIELD_CHARS) dropped += 1;
    else extras[k] = v;
  }
  return { extras, dropped };
}

/** One-time import of data from the old numdum (IndexedDB) shapes. Safe to run again. */
export function createImportService({ reminders, journal }) {
  async function importLegacy({ reminders: rs = [], journals: js = [] }) {
    const result = { reminders: 0, journals: 0, skipped: 0, dropped: 0 };
    const seen = new Set((await reminders.list()).map((r) => r.extras?.legacyId).filter(Boolean));

    for (const r of rs) {
      const legacyId = r?.id === undefined ? undefined : String(r.id);
      if (!r || typeof r.title !== 'string' || r.title.trim() === '' || !validDate(r.dueDate)) { result.skipped += 1; continue; }
      if (legacyId && seen.has(legacyId)) { result.skipped += 1; continue; }
      const { extras, dropped } = extrasOf(r, REMINDER_KNOWN);
      if (legacyId) extras.legacyId = legacyId;
      try {
        await reminders.create({
          title: r.title,
          due: new Date(r.dueDate).toISOString(),
          priority: PRIORITIES.includes(r.priority) ? r.priority : 'medium',
          repeat: REPEATS.includes(r.repeat) ? r.repeat : 'never',
          notes: typeof r.description === 'string' ? r.description : '',
          extras,
          done: Boolean(r.completed),
          completedAt: r.completed_at,
          createdAt: r.created_at,
        });
      } catch {
        result.skipped += 1;
        continue;
      }
      if (legacyId) seen.add(legacyId);
      result.reminders += 1;
      result.dropped += dropped;
    }

    for (const j of js) {
      if (!j || typeof j.text !== 'string' || j.text.trim() === '' || !validDate(j.createdAt) || j.id === undefined) { result.skipped += 1; continue; }
      const id = `legacy-${String(j.id)}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
      const { extras, dropped } = extrasOf(j, JOURNAL_KNOWN);
      try {
        await journal.create(
          { id, text: j.text, mood: typeof j.mood === 'string' || typeof j.mood === 'number' ? j.mood : undefined, createdAt: new Date(j.createdAt).toISOString(), extras },
          { assumeUnique: true },
        );
      } catch {
        result.skipped += 1; // already imported (same file) or unusable
        continue;
      }
      result.journals += 1;
      result.dropped += dropped;
    }
    return result;
  }
  return { importLegacy };
}
