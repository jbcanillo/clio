import * as CryptoJS from 'crypto-js';
import { apiFetch } from './api';
import { emitDataChanged } from './dataEvents';
import { deriveKey } from '../offline/crypto';
import remindersDB, { createJournalEntry, deleteAllJournalEntries } from '../utils/store';

/**
 * Encrypted backups of everything Clio stores.
 *
 * File layout (version 2): "CLIOBAK2" | PBKDF2 iterations (uint32, big endian) |
 * salt (16 bytes) | AES-GCM iv (12 bytes) | ciphertext of the JSON export.
 * Older files (version 1, CryptoJS text holding reminders and journal entries) can still be restored.
 */
const MAGIC = 'CLIOBAK2';
const HEADER = MAGIC.length + 4 + 16 + 12;
export const DEFAULT_ITERATIONS = 600_000;
export const MIN_PASSWORD = 8;
/** Restore uploads at most this much base64 per request (the server accepts 30 MB). */
const BATCH_CHARS = 8 * 1024 * 1024;
const BATCH_FILES = 500;

export interface BackupFile { path: string; data: string }
export interface BackupCounts { reminders: number; notes: number; diary: number; journal: number; photos: number; other: number }
export interface VaultBackup { format: 'clio-backup'; version: 2; exportedAt: string; counts: BackupCounts; files: BackupFile[] }
interface LegacyBackup { version?: number; exportedAt?: string; reminders: Record<string, unknown>[]; journal?: Record<string, unknown>[] }

export type OpenedBackup =
  | { kind: 'vault'; exportedAt: string | null; counts: BackupCounts; backup: VaultBackup }
  | { kind: 'legacy'; exportedAt: string | null; counts: BackupCounts; backup: LegacyBackup };

export class BackupError extends Error {}

const emptyCounts = (): BackupCounts => ({ reminders: 0, notes: 0, diary: 0, journal: 0, photos: 0, other: 0 });

const AREAS: Record<string, keyof BackupCounts> = { Reminders: 'reminders', Notes: 'notes', Daily: 'diary', Events: 'journal', Attachments: 'photos' };
export function countFiles(files: BackupFile[]): BackupCounts {
  const c = emptyCounts();
  for (const f of files) c[AREAS[f.path.split('/')[1]] ?? 'other'] += 1;
  return c;
}

const toBuffer = (u: Uint8Array) => u as unknown as BufferSource;

export async function encryptBackup(value: unknown, password: string, iterations = DEFAULT_ITERATIONS): Promise<Uint8Array> {
  if (!password) throw new BackupError('Enter a password.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBuffer(iv) }, key, toBuffer(plain)));
  const out = new Uint8Array(HEADER + ct.length);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(MAGIC.length, iterations);
  out.set(salt, MAGIC.length + 4);
  out.set(iv, MAGIC.length + 20);
  out.set(ct, HEADER);
  return out;
}

const WRONG = 'Wrong password, or this is not a Clio backup file.';

/** Decrypts a version 2 file, or an older CryptoJS one. */
export async function decryptBackup(bytes: Uint8Array, password: string): Promise<unknown> {
  if (!password) throw new BackupError('Enter the backup password.');
  const isV2 = bytes.length > HEADER && new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) === MAGIC;
  if (isV2) {
    const iterations = new DataView(bytes.buffer, bytes.byteOffset).getUint32(MAGIC.length);
    if (iterations < 1 || iterations > 10_000_000) throw new BackupError(WRONG);
    const key = await deriveKey(password, bytes.slice(MAGIC.length + 4, MAGIC.length + 20), iterations);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBuffer(bytes.slice(MAGIC.length + 20, HEADER)) }, key, toBuffer(bytes.slice(HEADER)));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      throw new BackupError(WRONG);
    }
  }
  try {
    const text = CryptoJS.AES.decrypt(new TextDecoder().decode(bytes).trim(), password).toString(CryptoJS.enc.Utf8);
    if (!text) throw new Error('empty');
    return JSON.parse(text);
  } catch {
    throw new BackupError(WRONG);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks what a decrypted file holds and counts it, without changing anything. */
export function describeBackup(data: unknown): OpenedBackup {
  if (isRecord(data) && data.format === 'clio-backup') {
    const files = data.files;
    if (data.version !== 2 || !Array.isArray(files) || !files.every((f) => isRecord(f) && typeof f.path === 'string' && f.path.startsWith('Clio/') && typeof f.data === 'string')) {
      throw new BackupError('This backup was made by a newer or unknown version of Clio.');
    }
    const backup = data as unknown as VaultBackup;
    return { kind: 'vault', exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null, counts: countFiles(backup.files), backup };
  }
  if (isRecord(data) && Array.isArray(data.reminders)) {
    const backup = data as unknown as LegacyBackup;
    const journal = Array.isArray(backup.journal) ? backup.journal : [];
    return {
      kind: 'legacy',
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
      counts: { ...emptyCounts(), reminders: backup.reminders.length, journal: journal.length },
      backup: { ...backup, journal },
    };
  }
  throw new BackupError(WRONG);
}

export function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the file."));
    reader.readAsArrayBuffer(file);
  });
}

export async function openBackupFile(file: Blob, password: string): Promise<OpenedBackup> {
  return describeBackup(await decryptBackup(await readFileBytes(file), password));
}

function saveBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([toBuffer(bytes)], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000); // revoking at once can cancel the download in some browsers
}

const requireOnline = () => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new BackupError("You're offline. Backup and restore need a connection to your Clio server.");
};

/** Fetches everything from the server, encrypts it with the password and downloads the file. */
export async function createBackup(password: string, { iterations = DEFAULT_ITERATIONS, now = new Date() } = {}): Promise<BackupCounts> {
  requireOnline();
  const backup = await apiFetch<VaultBackup>('/api/backup/export', { method: 'POST' });
  const bytes = await encryptBackup(backup, password, iterations);
  saveBytes(bytes, `clio-backup-${now.toISOString().slice(0, 10)}.enc`);
  return countFiles(backup.files);
}

/** Splits files into upload batches that stay under the server's body limit. */
export function batchFiles(files: BackupFile[], maxChars = BATCH_CHARS, maxFiles = BATCH_FILES): BackupFile[][] {
  const batches: BackupFile[][] = [];
  let cur: BackupFile[] = [];
  let size = 0;
  for (const f of files) {
    const n = f.data.length + f.path.length;
    if (cur.length && (size + n > maxChars || cur.length >= maxFiles)) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(f);
    size += n;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/**
 * Writes an opened backup to the server. `replace` removes Clio items the backup does not have
 * (photos are always kept); otherwise the backup is merged in, overwriting items it also has.
 */
export async function restoreBackup(opened: OpenedBackup, { replace }: { replace: boolean }, onProgress?: (done: number, total: number) => void): Promise<void> {
  requireOnline();
  try {
    if (opened.kind === 'vault') {
      const batches = batchFiles(opened.backup.files);
      let done = 0;
      onProgress?.(0, opened.backup.files.length);
      for (const files of batches) {
        await apiFetch('/api/backup/restore/files', { method: 'POST', json: { files } });
        done += files.length;
        onProgress?.(done, opened.backup.files.length);
      }
      await apiFetch('/api/backup/restore/finish', { method: 'POST', json: { keep: opened.backup.files.map((f) => f.path), prune: replace } });
      return;
    }
    // Version 1 files hold reminders and journal entries in the app's own shape.
    const { reminders, journal = [] } = opened.backup;
    const total = reminders.length + journal.length;
    let done = 0;
    if (replace) await Promise.all([remindersDB.deleteAllReminders(), deleteAllJournalEntries()]);
    for (const r of reminders) {
      const created = await remindersDB.createReminder(r);
      if (r.completed) await remindersDB.updateReminder({ ...r, id: created.id });
      onProgress?.(++done, total);
    }
    for (const j of journal) {
      await createJournalEntry(j);
      onProgress?.(++done, total);
    }
  } finally {
    emitDataChanged('all'); // even a partial restore changed things: every screen refetches
  }
}
