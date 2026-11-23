import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ScopedCopilot, getThreadId } from '../copilot/ScopedCopilot';

const kitProps: Array<Record<string, unknown>> = [];
const readable = vi.fn();
vi.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
    kitProps.push(props);
    return <>{children}</>;
  },
  useCopilotReadable: (arg: unknown) => readable(arg),
}));

const UUID = /^[0-9a-f-]{36}$/;

beforeEach(() => {
  sessionStorage.clear();
  kitProps.length = 0;
  readable.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('getThreadId', () => {
  it('is stable for a scope within the session', () => {
    const a = getThreadId('diary');
    expect(a).toMatch(/^clio-diary-/);
    expect(a.slice('clio-diary-'.length)).toMatch(UUID);
    expect(getThreadId('diary')).toBe(a);
    expect(sessionStorage.getItem('clio.thread.diary')).toBe(a.slice('clio-diary-'.length));
  });

  it('differs between scopes', () => {
    expect(getThreadId('chat')).not.toBe(getThreadId('notes'));
    expect(getThreadId('chat').startsWith('clio-chat-')).toBe(true);
  });

  it('still returns a stable id when sessionStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const a = getThreadId('reminders');
    expect(a).toMatch(/^clio-reminders-/);
    expect(getThreadId('reminders')).toBe(a);
  });
});

describe('ScopedCopilot', () => {
  it('mounts a CopilotKit provider with the scoped thread and session token', () => {
    sessionStorage.setItem('clio.token', 'tok');
    render(<ScopedCopilot scope="notes"><span>child</span></ScopedCopilot>);
    const p = kitProps[kitProps.length - 1];
    expect(p).toMatchObject({
      runtimeUrl: '/api/copilotkit',
      useSingleEndpoint: true,
      threadId: getThreadId('notes'),
      enableInspector: false,
      showDevConsole: false,
    });
    expect(p).not.toHaveProperty('agent');
    expect(p.headers).toEqual({ 'X-Session-Token': 'tok' });
    expect(readable).toHaveBeenCalledWith({
      description: 'Which Clio screen the owner is on. This grants no extra permissions.',
      value: { scope: 'notes' },
    });
  });
});
