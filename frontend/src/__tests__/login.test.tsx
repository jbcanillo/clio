import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthGate } from '../lib/auth';
import { getToken } from '../lib/api';

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status }));

describe('AuthGate', () => {
  it('shows the login screen, stores the token on success and reveals the app', async () => {
    respond(200, { token: 'abc' });
    render(<AuthGate><p>secret app</p></AuthGate>);
    expect(screen.queryByText('secret app')).toBeNull();
    await userEvent.type(screen.getByLabelText(/password/i), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByText('secret app')).toBeInTheDocument();
    expect(getToken()).toBe('abc');
  });
  it('says "Wrong password." on 401 and the lockout message on 429', async () => {
    respond(401, { error: 'invalid' });
    render(<AuthGate><p>app</p></AuthGate>);
    await userEvent.type(screen.getByLabelText(/password/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password.');
    respond(429, { error: 'locked' });
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });
});
