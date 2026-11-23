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
  const res = await fetch(path, { ...rest, headers });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') clearToken();
    throw new ApiError(res.status, data?.error || 'error', data?.message);
  }
  return data as T;
}
