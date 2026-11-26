import { ValidationError } from '../errors.js';

/** Everything Clio stores lives under this vault folder. */
export const BACKUP_ROOT = 'Clio';
const ATTACHMENTS = `${BACKUP_ROOT}/Attachments/`;
export const BACKUP_FORMAT = 'clio-backup';
export const BACKUP_VERSION = 2;

/** Which part of the app a backed-up path belongs to (for the counts shown before a restore). */
export function areaOf(path) {
  const top = path.slice(BACKUP_ROOT.length + 1).split('/')[0];
  return { Reminders: 'reminders', Notes: 'notes', Daily: 'diary', Events: 'journal', Attachments: 'photos' }[top] ?? 'other';
}

const SEGMENT_BAD = /[\\\0:*?"<>|]/;
/** A path restore may write: inside Clio/, plain segments only, never a temp file. */
export function checkBackupPath(path) {
  if (typeof path !== 'string' || path.length > 500 || !path.startsWith(`${BACKUP_ROOT}/`) || path.endsWith('.tmp')) {
    throw new ValidationError(`not a Clio backup path: ${String(path).slice(0, 80)}`);
  }
  for (const seg of path.split('/')) {
    if (!seg || seg === '.' || seg === '..' || SEGMENT_BAD.test(seg)) {
      throw new ValidationError(`not a Clio backup path: ${path.slice(0, 80)}`);
    }
  }
  return path;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Full backup and restore of the Clio folder: reminders, notes, diary days,
 * journal entries, Clio's memory of the owner and photos, as raw file bytes.
 */
export function createBackupService({ vault, now = () => new Date() }) {
  async function exportAll() {
    const files = [];
    const counts = { reminders: 0, notes: 0, diary: 0, journal: 0, photos: 0, other: 0 };
    for (const path of await vault.listFiles(BACKUP_ROOT)) {
      const buf = await vault.readFile(path);
      if (!buf) continue; // removed while we walked
      files.push({ path, data: buf.toString('base64') });
      counts[areaOf(path)] += 1;
    }
    return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now().toISOString(), counts, files };
  }

  /** Writes one batch of backed-up files, replacing any file at the same path. */
  async function writeFiles(files) {
    const checked = files.map((f) => {
      checkBackupPath(f.path);
      if (typeof f.data !== 'string' || !BASE64.test(f.data)) throw new ValidationError(`data must be base64: ${f.path}`);
      return { path: f.path, buf: Buffer.from(f.data, 'base64') };
    });
    for (const f of checked) await vault.writeRaw(f.path, f.buf);
    return { written: checked.length };
  }

  /**
   * After every batch is written: removes Clio files the backup did not have, so the
   * vault matches the backup. Photos are never removed (they are harmless and may be
   * linked from notes edited elsewhere).
   */
  async function prune(keepPaths) {
    const keep = new Set(keepPaths.map(checkBackupPath));
    let removed = 0;
    for (const path of await vault.listFiles(BACKUP_ROOT)) {
      if (keep.has(path) || path.startsWith(ATTACHMENTS)) continue;
      await vault.deleteFile(path);
      removed += 1;
    }
    return { removed };
  }

  return { exportAll, writeFiles, prune };
}
