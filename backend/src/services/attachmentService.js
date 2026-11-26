import { ValidationError } from '../errors.js';

export const ATTACHMENTS_DIR = 'Clio/Attachments';
/** `<client id>.<ext>`; the client picks the id so an upload can be retried or queued offline. */
export const ATTACHMENT_FILE = /^[a-z0-9]{8,40}\.(jpg|png|webp|gif)$/;
const MAX_BYTES = 4 * 1024 * 1024;

const EXT_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** Checks the file really is the image type it claims (by its first bytes). */
function looksLike(ext, buf) {
  if (ext === 'jpg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === 'png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === 'gif') return buf.subarray(0, 4).toString('latin1') === 'GIF8';
  if (ext === 'webp') return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

const notFound = () => Object.assign(new Error('Attachment not found'), { code: 'not_found' });

/** Photos stored as plain files in Clio/Attachments/, so Obsidian shows them too. */
export function createAttachmentService({ vault }) {
  const pathFor = (file) => `${ATTACHMENTS_DIR}/${file}`;

  /** Idempotent: uploading the same file name again keeps the first copy. */
  async function put({ file, mime, data }) {
    const m = typeof file === 'string' ? ATTACHMENT_FILE.exec(file) : null;
    if (!m) throw new ValidationError('file must be <id>.jpg|png|webp|gif');
    if (EXT_MIME[m[1]] !== mime) throw new ValidationError('mime does not match the file extension');
    if (typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new ValidationError('data must be base64');
    const buf = Buffer.from(data, 'base64');
    if (buf.length === 0) throw new ValidationError('empty file');
    if (buf.length > MAX_BYTES) throw new ValidationError('photo is too large (max 4 MB)');
    if (!looksLike(m[1], buf)) throw new ValidationError('file content is not a valid image of that type');
    const { created } = await vault.writeFileOnce(pathFor(file), buf);
    return { file, path: pathFor(file), created };
  }

  async function get(file) {
    const m = typeof file === 'string' ? ATTACHMENT_FILE.exec(file) : null;
    if (!m) throw notFound();
    const buf = await vault.readFile(pathFor(file));
    if (!buf) throw notFound();
    return { file, mime: EXT_MIME[m[1]], data: buf.toString('base64') };
  }

  return { put, get };
}
