import { FormEvent, ReactNode, useEffect, useState } from 'react';
import CosmicBackdrop from '../components/layout/CosmicBackdrop';
import { canUnlockOffline, endOfflineSession, isOfflineSession, isUnlocked, offlineSupported, unlockOffline, unlockOutbox } from '../offline/session';
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

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

interface AuthState { token: string | null; unlocked: boolean; offlineSession: boolean; online: boolean }
const snapshot = (): AuthState => ({ token: getToken(), unlocked: isUnlocked(), offlineSession: isOfflineSession(), online: isOnline() });

function useAuthState(): AuthState {
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    const sync = () => setState(snapshot());
    // Back online, or the server answered "no session": an offline unlock is no longer enough.
    const reconnect = () => { if (!getToken()) endOfflineSession(); sync(); };
    const expired = () => { endOfflineSession(); sync(); };
    window.addEventListener('clio-auth', sync);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', sync);
    window.addEventListener('clio-auth-expired', expired);
    return () => {
      window.removeEventListener('clio-auth', sync);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', sync);
      window.removeEventListener('clio-auth-expired', expired);
    };
  }, []);
  return state;
}

export function LoginScreen({ notice }: { notice?: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    // No server: check the password against this device's encrypted copy instead.
    const offlineUnlock = async () => {
      if (await unlockOffline(password)) return;
      setError('Wrong password.');
    };
    try {
      if (!isOnline() && canUnlockOffline()) {
        await offlineUnlock();
        return;
      }
      const { token } = await apiFetch<{ token: string }>('/api/auth/login', { method: 'POST', json: { password } });
      await unlockOutbox(password).catch(() => {}); // offline storage needs a secure context; chat works without
      setToken(token);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const unreachable = status === 0 || status === 502 || status === 503 || status === 504;
      if (unreachable && canUnlockOffline()) await offlineUnlock();
      else setError(status === 429 ? 'Too many attempts. Try again in 15 minutes.' : status === 401 ? 'Wrong password.' : 'Could not reach Clio.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-8 p-6">
      <CosmicBackdrop />
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="relative">
          <div aria-hidden="true" className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(63,166,180,0.35),transparent_70%)]" />
          <img src="/logo.png" alt="" width={128} height={128} className="brand-medallion relative h-32 w-32" />
        </div>
        <h1 className="brand-wordmark mt-6 text-5xl">Clio</h1>
        <p className="eyebrow mt-3">
          <span className="text-[var(--primary)]">Personal second</span> <span className="text-ember">brain agent</span>
        </p>
      </div>
      <form onSubmit={submit} className="glass relative z-10 w-full max-w-sm space-y-4 rounded-2xl border border-hairline p-6 shadow-modal">
        {notice && <p role="status" className="text-sm text-ink-soft">{notice}</p>}
        <label className="block text-sm text-ink-soft">
          Password
          <input className="input input-bordered mt-1 w-full" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-error text-sm">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || password === ''}>Unlock</button>
      </form>
    </main>
  );
}

/**
 * The app opens only once the password has been entered in this page load: the key that encrypts the
 * offline copy and queue lives in memory, so a reload asks again. Offline, an unlock checked against the
 * local copy is enough; once back online without a session, the password is asked for once more so the
 * queued changes can sync. Without Web Crypto (plain-http LAN use) the session token alone is enough.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { token, unlocked, offlineSession, online } = useAuthState();
  if (!offlineSupported()) return token ? <>{children}</> : <LoginScreen />;
  if (unlocked && (token || offlineSession)) return <>{children}</>;
  const notice = unlocked && !token
    ? "You're back online. Enter your password to sync your offline changes."
    : !online && canUnlockOffline()
      ? "You're offline. Unlock to use your saved copy; changes sync when you reconnect."
      : undefined;
  return <LoginScreen notice={notice} />;
}
