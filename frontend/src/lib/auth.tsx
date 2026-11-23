import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { ApiError, apiFetch, getToken, setToken } from './api';

export function useToken(): string | null {
  const [token, setLocal] = useState<string | null>(getToken());
  useEffect(() => {
    const sync = () => setLocal(getToken());
    window.addEventListener('clio-auth', sync);
    return () => window.removeEventListener('clio-auth', sync);
  }, []);
  return token;
}

export function LoginScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await apiFetch<{ token: string }>('/api/auth/login', { method: 'POST', json: { password } });
      setToken(token);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 429 ? 'Too many attempts. Try again in 15 minutes.' : status === 401 ? 'Wrong password.' : 'Could not reach Clio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="card bg-base-200 p-6 w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Clio</h1>
        <label className="block text-sm">
          Password
          <input className="input input-bordered w-full mt-1" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-error text-sm">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || password === ''}>Unlock</button>
      </form>
    </main>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  return useToken() ? <>{children}</> : <LoginScreen />;
}
