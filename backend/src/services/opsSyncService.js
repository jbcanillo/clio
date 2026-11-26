import fs from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../errors.js';
import { ConflictError } from './vaultService.js';

const MAX_RECEIPTS = 5000;

/**
 * Applies reminder and check-in changes made offline, in the order they were made.
 * Idempotent by op id (receipts are kept on disk), so a client may resend a batch safely.
 * Results per op:
 *   applied   - done now (`result` carries the saved reminder where there is one)
 *   duplicate - this op id was applied before, or the reminder it creates already exists
 *   rejected  - can never succeed (bad input, or the reminder is gone); the client drops it
 * Anything else (disk errors and the like) throws, so the client keeps the op and retries.
 */
export function createOpsSyncService({ reminders, daily, attachments, dataDir, memory }) {
  const file = path.join(dataDir, 'sync-ops-receipts.json');
  fs.mkdirSync(dataDir, { recursive: true });

  const load = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const save = (receipts) => {
    const keys = Object.keys(receipts);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_RECEIPTS))) delete receipts[k];
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(receipts));
    fs.renameSync(tmp, file);
  };

  async function run(op) {
    switch (op.kind) {
      case 'reminder.create':
        try {
          return { status: 'applied', result: await reminders.create(op.data) };
        } catch (e) {
          if (e instanceof ConflictError) return { status: 'duplicate' }; // created by an earlier, interrupted attempt
          throw e;
        }
      case 'reminder.update':
        return { status: 'applied', result: await reminders.update(op.reminderId, op.patch) };
      case 'reminder.complete':
        return { status: 'applied', result: await reminders.complete(op.reminderId) };
      case 'reminder.snooze':
        return { status: 'applied', result: await reminders.snooze(op.reminderId, op.until) };
      case 'reminder.delete':
        await reminders.remove(op.reminderId);
        return { status: 'applied' };
      case 'attachment.put':
        if (!attachments) throw new ValidationError('attachments are not enabled');
        await attachments.put({ file: op.file, mime: op.mime, data: op.data });
        return { status: 'applied' };
      case 'daily.replace':
        return { status: 'applied', result: await daily.replace(op.date, op.day) };
      case 'daily.append':
        await daily.append(op.date, op.entry);
        return { status: 'applied' };
      default:
        throw new ValidationError(`unknown op kind ${op.kind}`);
    }
  }

  async function applyOne(op) {
    try {
      return await run(op);
    } catch (e) {
      if (e instanceof ValidationError) return { status: 'rejected', code: 'invalid', message: e.message };
      if (e?.code === 'not_found') return { status: 'rejected', code: 'not_found' };
      if (e instanceof ConflictError) {
        // The file changed between our read and write: one retry against the fresh copy.
        try {
          return await run(op);
        } catch (again) {
          if (!(again instanceof ConflictError)) throw again;
        }
        return { status: 'rejected', code: 'conflict' };
      }
      throw e;
    }
  }

  async function apply(ops) {
    const receipts = load();
    const results = [];
    let changed = false;
    for (const op of ops) {
      if (receipts[op.id]) {
        results.push({ id: op.id, ...receipts[op.id], status: 'duplicate' });
        continue;
      }
      const r = await applyOne(op);
      // The receipt keeps only the outcome, not the saved data.
      receipts[op.id] = { status: r.status, ...(r.code ? { code: r.code } : {}) };
      save(receipts); // after every op, so a crash cannot replay applied ones
      if (r.status === 'applied') changed = true;
      results.push({ id: op.id, ...r });
    }
    if (changed) await memory?.reindex();
    return results;
  }

  return { apply };
}
