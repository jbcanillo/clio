const TOKEN_KEY = 'clio.token';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const getToken = (): string | null => {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t: string): void => {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('clio-auth'));
};
export const clearToken = (): void => {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event('clio-auth'));
};

/** fetch wrapper: adds the session token, parses JSON, throws ApiError, drops the token on 401. */
export async function apiFetch<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string> | undefined) };
  const token = getToken();
  if (token) headers['X-Session-Token'] = token;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    rest.body = JSON.stringify(json);
  }
  const cacheable = readThrough !== null && (!rest.method || rest.method.toUpperCase() === 'GET') && path.startsWith('/api/') && !path.startsWith('/api/copilotkit');
  const fromCache = async (err: unknown): Promise<T> => {
    const hit = cacheable ? await readThrough!.offline(path).catch(() => undefined) : undefined;
    if (hit) return hit.data as T;
    throw err;
  };

  if (cacheable && typeof navigator !== 'undefined' && navigator.onLine === false) return fromCache(new TypeError('offline'));
  let res: Response;
  try {
    res = await fetch(path, { ...rest, headers });
  } catch (e) {
    return fromCache(e); // no connection: serve the last copy we saw, if any
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: { error?: string; message?: string } | undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined; // e.g. a proxy's HTML error page
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') {
      clearToken();
      window.dispatchEvent(new Event('clio-auth-expired'));
    }
    const err = new ApiError(res.status, data?.error || 'error', data?.message);
    if (res.status === 502 || res.status === 503 || res.status === 504) return fromCache(err);
    throw err;
  }
  return (cacheable ? await readThrough!.fresh(path, data) : data) as T;
}

/** Offline read support, installed by the offline module (kept out of here to avoid an import cycle). */
export interface ReadThrough {
  /** Called with every successful GET; stores a copy and returns the data to hand back. */
  fresh(path: string, data: unknown): Promise<unknown>;
  /** Called when the server can't be reached; the last stored copy, or undefined. */
  offline(path: string): Promise<{ data: unknown } | undefined>;
}
let readThrough: ReadThrough | null = null;
export function setReadThrough(r: ReadThrough | null): void {
  readThrough = r;
}
