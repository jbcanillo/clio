import { useEffect, useState } from 'react';
import { readCache, writeOrQueue } from '../offline/instances';
import { apiFetch } from './api';
import { newUuid } from './uuid';

export type PhotoMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/** A photo picked on this device, resized and ready to upload. */
export interface PreparedPhoto {
  file: string; // "<id>.<ext>", the name it gets in Clio/Attachments
  mime: PhotoMime;
  data: string; // base64
  url: string; // local preview (object URL)
}

/** A photo in a form: either already stored (`file` only) or freshly picked (`prepared`). */
export interface PhotoItem {
  file: string;
  prepared?: PreparedPhoto;
}

const MAX_SIDE = 1600;
const MAX_BYTES = 4 * 1024 * 1024;
const EXT: Record<PhotoMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const newPhotoId = () => Date.now().toString(36) + newUuid().replace(/-/g, '').slice(0, 10);

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

/** Scales a photo down to MAX_SIDE as JPEG; null where the browser can't (the original is used then). */
async function shrink(file: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82));
  } catch {
    return null;
  }
}

/** Resizes (to keep uploads and the offline copy small) and encodes a picked photo. */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not a photo.');
  const small = file.type === 'image/gif' ? null : await shrink(file); // keep GIFs animated
  const blob = small ?? file;
  const mime = (small ? 'image/jpeg' : blob.type) as PhotoMime;
  if (!EXT[mime]) throw new Error('Use a JPEG, PNG, WebP or GIF photo.');
  if (blob.size > MAX_BYTES) throw new Error('That photo is too large (max 4 MB).');
  return { file: `${newPhotoId()}.${EXT[mime]}`, mime, data: await toBase64(blob), url: URL.createObjectURL(blob) };
}

/**
 * Stores a photo on the server, or queues it (encrypted) when offline. It is also put in the
 * offline copy straight away, so it shows up before it has synced.
 */
export async function savePhoto(p: PreparedPhoto): Promise<void> {
  const body = { file: p.file, mime: p.mime, data: p.data };
  await readCache.put(`/api/attachments/${p.file}`, body).catch(() => {});
  await writeOrQueue(
    { kind: 'attachment.put', ...body },
    async () => { await apiFetch('/api/attachments', { method: 'POST', json: body }); },
    () => undefined,
    null,
  );
}

/** Uploads the freshly picked photos in a form and returns every file name, in order. */
export async function savePhotoItems(items: PhotoItem[]): Promise<string[]> {
  for (const it of items) if (it.prepared) await savePhoto(it.prepared);
  return items.map((it) => it.file);
}

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Object URL for a stored photo (fetched with the session, served from the offline copy when offline). */
export function usePhotoUrl(file: string | null | undefined): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    if (!file) return undefined;
    let live = true;
    let url: string | null = null;
    apiFetch<{ mime: string; data: string }>(`/api/attachments/${encodeURIComponent(file)}`)
      .then((a) => {
        if (!live) return;
        url = URL.createObjectURL(base64ToBlob(a.data, a.mime));
        setState({ url, failed: false });
      })
      .catch(() => { if (live) setState({ url: null, failed: true }); });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);
  return state;
}

/** Markdown line linking a photo from a note in Clio/Notes or Clio/Daily. */
export const photoMarkdown = (file: string) => `![photo](../Attachments/${file})`;
const PHOTO_LINE = /^\s*!\[[^\]]*\]\(\.\.\/Attachments\/([a-z0-9]{8,40}\.(?:jpg|png|webp|gif))\)\s*$/;
export const photoFromLine = (line: string): string | null => PHOTO_LINE.exec(line)?.[1] ?? null;
