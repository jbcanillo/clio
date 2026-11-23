import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ClioChat } from '../components/chat/ClioChat';
import { DATA_CHANGED_EVENT } from '../lib/dataEvents';

type Msg = { id: string; role: string; content?: unknown; generativeUI?: () => ReactNode };
type ErrorEvent = { error: Error; code: string; context?: Record<string, unknown> };

const chat = {
  messages: [] as Msg[],
  sendMessage: vi.fn(),
  deleteMessage: vi.fn(),
  stopGeneration: vi.fn(),
  reset: vi.fn(),
  isLoading: false,
  isAvailable: true,
};
let errorSubscribers: Array<(e: ErrorEvent) => void> = [];

vi.mock('@copilotkit/react-core', () => ({ useCopilotChatInternal: () => chat }));
vi.mock('@copilotkit/react-core/v2/context', () => ({
  useCopilotKit: () => ({
    copilotkit: {
      subscribe: (s: { onError?: (e: ErrorEvent) => void }) => {
        if (s.onError) errorSubscribers.push(s.onError);
        return { unsubscribe: () => { errorSubscribers = errorSubscribers.filter(f => f !== s.onError); } };
      },
    },
  }),
}));

const CHIPS = [{ label: 'Plan my day', prompt: 'Help me plan today' }];

function renderChat(props: Partial<Parameters<typeof ClioChat>[0]> = {}) {
  return render(<ClioChat scope="chat" placeholder="Talk to Clio" chips={CHIPS} mode="full" {...props} />);
}

function fireError(code = 'agent_run_failed', context: Record<string, unknown> = {}) {
  act(() => errorSubscribers.forEach(f => f({ error: new Error('boom'), code, context })));
}

beforeEach(() => {
  chat.messages = [];
  chat.sendMessage = vi.fn().mockResolvedValue(undefined);
  chat.deleteMessage = vi.fn();
  chat.stopGeneration = vi.fn();
  chat.isLoading = false;
  chat.isAvailable = true;
  errorSubscribers = [];
});

describe('ClioChat composer', () => {
  it('sends a user message and clears the input', async () => {
    renderChat();
    const box = screen.getByPlaceholderText('Talk to Clio');
    await userEvent.type(box, 'hi');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    expect(chat.sendMessage.mock.calls[0][0]).toMatchObject({ role: 'user', content: 'hi' });
    expect(typeof chat.sendMessage.mock.calls[0][0].id).toBe('string');
    expect(box).toHaveValue('');
  });

  it('Enter sends, Shift+Enter inserts a newline', async () => {
    renderChat();
    const box = screen.getByPlaceholderText('Talk to Clio');
    await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(box).toHaveValue('line one\nline two');
    await userEvent.type(box, '{Enter}');
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    expect(chat.sendMessage.mock.calls[0][0].content).toBe('line one\nline two');
  });

  it('disables Send when the input is empty or whitespace, or Clio is unavailable', async () => {
    const { rerender } = renderChat();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('Talk to Clio'), '   ');
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('Talk to Clio'), '{Enter}');
    expect(chat.sendMessage).not.toHaveBeenCalled();
    await userEvent.type(screen.getByPlaceholderText('Talk to Clio'), 'x');
    expect(send).toBeEnabled();
    chat.isAvailable = false;
    rerender(<ClioChat scope="chat" placeholder="Talk to Clio" chips={CHIPS} mode="full" />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('a chip click sends its prompt', async () => {
    renderChat();
    await userEvent.click(screen.getByRole('button', { name: /plan my day/i }));
    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    expect(chat.sendMessage.mock.calls[0][0]).toMatchObject({ role: 'user', content: 'Help me plan today' });
  });

  it('has no mic, voice or speak controls', () => {
    renderChat();
    expect(screen.queryAllByRole('button', { name: /mic|voice|speak/i })).toHaveLength(0);
    expect(screen.queryAllByLabelText(/mic|voice|speak/i)).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /attach|file/i })).toHaveLength(0);
  });
});

describe('ClioChat messages', () => {
  it('renders hostile markup in a Clio message as text, with the AI badge', () => {
    chat.messages = [
      { id: 'u1', role: 'user', content: 'hello' },
      { id: 'a1', role: 'assistant', content: '<b>x</b>\nsecond line' },
    ];
    const { container } = renderChat();
    expect(screen.getByText(/<b>x<\/b>/)).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText(/AI Synthesized/)).toBeInTheDocument();
  });

  it('renders generative UI inline and skips tool messages', () => {
    chat.messages = [
      { id: 'a1', role: 'assistant', content: '', generativeUI: () => <div data-testid="gen-card">card</div> },
      { id: 't1', role: 'tool', content: 'RAW TOOL RESULT' },
    ];
    renderChat();
    expect(screen.getByTestId('gen-card')).toBeInTheDocument();
    expect(screen.queryByText('RAW TOOL RESULT')).toBeNull();
  });

  it('does not add a card slot when generative UI renders an empty wrapper', () => {
    chat.messages = [{ id: 'a1', role: 'assistant', content: 'plain reply', generativeUI: () => <></> }];
    const { container } = renderChat();
    expect(screen.getByText('plain reply')).toBeInTheDocument();
    expect(container.querySelectorAll('.empty\\:hidden')).toHaveLength(0);
  });

  it('shows the empty state when there are no messages', () => {
    renderChat({ empty: <p>Nothing yet</p> });
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('shows a typing indicator and a Stop button while loading', async () => {
    chat.messages = [{ id: 'u1', role: 'user', content: 'hi' }];
    chat.isLoading = true;
    renderChat();
    expect(screen.getByRole('status', { name: /clio is typing/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(chat.stopGeneration).toHaveBeenCalledTimes(1);
  });

  it('has no Stop button when idle', () => {
    renderChat();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });
});

describe('ClioChat run lifecycle', () => {
  it('fires clio:data-changed exactly once when a run finishes', () => {
    const seen: unknown[] = [];
    const handler = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    try {
      const view = () => <ClioChat scope="chat" placeholder="Talk to Clio" chips={CHIPS} mode="full" />;
      const { rerender } = render(view());
      chat.isLoading = true;
      rerender(view());
      rerender(view());
      expect(seen).toEqual([]);
      chat.isLoading = false;
      rerender(view());
      rerender(view());
      expect(seen).toEqual(['all']);
    } finally {
      window.removeEventListener(DATA_CHANGED_EVENT, handler);
    }
  });

  it('shows an alert on a run error and Retry resends the last user message', async () => {
    renderChat();
    await userEvent.type(screen.getByPlaceholderText('Talk to Clio'), 'remind me{Enter}');
    chat.messages = [{ id: 'u1', role: 'user', content: 'remind me' }];
    fireError('agent_run_failed');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Clio couldn't answer. Check Settings or try again.");
    expect(screen.getByPlaceholderText('Talk to Clio')).toBeEnabled();
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(chat.sendMessage).toHaveBeenCalledTimes(2);
    expect(chat.sendMessage.mock.calls[1][0]).toMatchObject({ role: 'user', content: 'remind me' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the alert when the runtime answers 503 (info fetch failed)', () => {
    renderChat();
    fireError('runtime_info_fetch_failed');
    expect(screen.getByRole('alert')).toHaveTextContent("Clio couldn't answer");
  });

  it('ignores RUN_ERROR events replayed from stored history', () => {
    renderChat();
    fireError('agent_run_error_event', { phase: 'replay' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the alert when sending rejects', async () => {
    chat.sendMessage = vi.fn().mockRejectedValue(new Error('network'));
    renderChat();
    await userEvent.type(screen.getByPlaceholderText('Talk to Clio'), 'hi{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("Clio couldn't answer");
  });
});

describe('ClioChat sheet mode', () => {
  const sheet = () => <ClioChat scope="reminders" placeholder="Ask about reminders" chips={CHIPS} mode="sheet" sheetTitle="Clio · Reminders" />;

  it('keeps the composer visible while the sheet is closed', () => {
    chat.messages = [{ id: 'a1', role: 'assistant', content: 'earlier reply' }];
    render(sheet());
    expect(screen.getByPlaceholderText('Ask about reminders')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /plan my day/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('earlier reply')).toBeNull();
  });

  it('opens the thread sheet on send', async () => {
    render(sheet());
    await userEvent.type(screen.getByPlaceholderText('Ask about reminders'), 'hi{Enter}');
    expect(screen.getByRole('dialog', { name: 'Clio · Reminders' })).toBeInTheDocument();
  });

  it('shows a Conversation pill only when the thread has messages, and it opens the sheet', async () => {
    const { rerender } = render(sheet());
    expect(screen.queryByRole('button', { name: /conversation/i })).toBeNull();
    chat.messages = [{ id: 'a1', role: 'assistant', content: 'earlier reply' }];
    rerender(sheet());
    await userEvent.click(screen.getByRole('button', { name: /conversation/i }));
    const dialog = screen.getByRole('dialog', { name: 'Clio · Reminders' });
    expect(within(dialog).getByText('earlier reply')).toBeInTheDocument();
  });
});
