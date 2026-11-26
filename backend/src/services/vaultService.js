import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export class PathError extends Error {}
export class ConflictError extends Error {
  constructor(current) {
    super('The file changed since it was read');
    this.current = current; // VaultFile | null
  }
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Reads and writes markdown files under one vault directory.
 * Every path is relative to the vault root and is checked so nothing outside
 * the vault (absolute paths, `..`, symlinks) can be touched.
 */
export function createVaultService({ vaultDir }) {
  const rootReal = fs.realpathSync(vaultDir);

  /** Resolves a vault-relative path to an absolute one, or throws PathError. */
  function resolve(relPath) {
    if (typeof relPath !== 'string' || relPath === '' || path.isAbsolute(relPath) || relPath.includes('\0')) {
      throw new PathError(`Invalid vault path: ${relPath}`);
    }
    const abs = path.resolve(rootReal, relPath);
    if (abs !== rootReal && !abs.startsWith(rootReal + path.sep)) throw new PathError(`Path escapes the vault: ${relPath}`);
    // The nearest existing ancestor must still resolve inside the vault (catches symlinks).
    let probe = abs;
    while (!fs.existsSync(probe)) probe = path.dirname(probe);
    const real = fs.realpathSync(probe);
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) throw new PathError(`Path escapes the vault: ${relPath}`);
    return abs;
  }

  function parse(relPath, raw) {
    const hash = sha256(raw);
    const text = raw.toString('utf8');
    try {
      const { data, content } = matter(text, {});
      return { path: relPath, frontmatter: data, body: content, hash };
    } catch {
      return { path: relPath, frontmatter: {}, body: text, hash, parseError: true };
    }
  }

  async function read(relPath) {
    const abs = resolve(relPath);
    let raw;
    try {
      raw = await fs.promises.readFile(abs);
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') return null;
      throw e;
    }
    return parse(relPath, raw);
  }

  async function write(relPath, doc, { expectedHash } = {}) {
    if (expectedHash === undefined) throw new TypeError('write requires opts.expectedHash (null = must not exist)');
    const abs = resolve(relPath);
    const current = await read(relPath);
    if (expectedHash === null ? current !== null : current === null || current.hash !== expectedHash) {
      throw new ConflictError(current);
    }
    const out = Buffer.from(matter.stringify(doc.body ?? '', doc.frontmatter ?? {}), 'utf8');
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    resolve(relPath); // re-check after mkdir: a symlinked parent must not slip through
    const tmp = `${abs}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await fs.promises.writeFile(tmp, out);
      await fs.promises.rename(tmp, abs);
    } catch (e) {
      await fs.promises.rm(tmp, { force: true });
      throw e;
    }
    return { hash: sha256(out) };
  }

  async function list(relDir) {
    const abs = resolve(relDir);
    const out = [];
    async function walk(dir, rel) {
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return;
        throw e;
      }
      for (const entry of entries) {
        const childRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), childRel);
        else if (entry.isFile() && entry.name.endsWith('.md')) out.push(childRel);
      }
    }
    await walk(abs, relDir.replace(/\/+$/, ''));
    return out.sort();
  }

  async function remove(relPath, { expectedHash }) {
    const abs = resolve(relPath);
    const current = await read(relPath);
    if (current === null || current.hash !== expectedHash) throw new ConflictError(current);
    await fs.promises.rm(abs);
  }

  async function uniquePath(relDir, title) {
    const base =
      String(title)
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/, '') || 'untitled';
    const dir = relDir.replace(/\/+$/, '');
    let candidate = `${dir}/${base}.md`;
    for (let n = 2; await read(candidate); n++) candidate = `${dir}/${base}-${n}.md`;
    return candidate;
  }

  /** Raw bytes of any vault file (attachments), or null. */
  async function readFile(relPath) {
    const abs = resolve(relPath);
    try {
      return await fs.promises.readFile(abs);
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'EISDIR') return null;
      throw e;
    }
  }

  /** Writes a binary file once; an existing file is left untouched (created: false). */
  async function writeFileOnce(relPath, buf) {
    const abs = resolve(relPath);
    if (fs.existsSync(abs)) return { created: false };
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    resolve(relPath); // re-check after mkdir: a symlinked parent must not slip through
    const tmp = `${abs}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await fs.promises.writeFile(tmp, buf);
      await fs.promises.rename(tmp, abs);
    } catch (e) {
      await fs.promises.rm(tmp, { force: true });
      throw e;
    }
    return { created: true };
  }

  return { read, write, list, remove, uniquePath, readFile, writeFileOnce };
}
