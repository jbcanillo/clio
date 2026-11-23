import { apiFetch, ApiError, setToken, getToken } from '../lib/api';

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

describe('apiFetch', () => {
  it('sends the session token and parses JSON', async () => {
    setToken('tok');
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 }));
    expect(await apiFetch('/api/x')).toEqual({ a: 1 });
    expect((f.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Session-Token': 'tok' });
  });
  it('throws ApiError with the status and the server error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ error: 'invalid' }), { status: 400 }));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 400, code: 'invalid' });
    await expect(apiFetch('/api/x')).rejects.toBeInstanceOf(ApiError);
  });
  it('clears the token on 401 so the login screen returns', async () => {
    setToken('tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"unauthorized"}', { status: 401 }));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBeNull();
  });
  it('returns undefined for 204', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiFetch('/api/x', { method: 'DELETE' })).toBeUndefined();
  });
});
