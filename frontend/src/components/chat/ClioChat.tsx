import { useCopilotChatInternal } from '@copilotkit/react-core';
import { useCopilotKit } from '@copilotkit/react-core/v2/context';
import { MessageCircle, Send, Sparkles, Square } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { apiFetch } from '../../lib/api';
import { failureReason, type KeyTest } from '../../lib/keyStatus';
import { emitDataChanged } from '../../lib/dataEvents';
import type { Scope } from '../../lib/types';
import { newUuid } from '../../lib/uuid';
import { Sheet } from '../ui/Sheet';
import { MessageList, messageText, type ChatMessage } from './MessageList';

export interface ClioChatChip {
  label: string;
  prompt: string;
}

export interface ClioChatProps {
  scope: Scope;
  placeholder: string;
  chips: ClioChatChip[];
  mode: 'full' | 'sheet';
  empty?: ReactNode;
  sheetTitle?: string;
  /** Send this text once per distinct id (e.g. a page's search-or-ask bar). Waits until Clio is available. */
  pendingPrompt?: { id: string; text: string };
}

/**
 * CopilotKit core error codes that mean "this chat could not get an answer".
 * They reach us through `copilotkit.subscribe({ onError })`: sendMessage itself
 * swallows run failures (it only console.errors), so the hook never throws them.
 * A 503 from /api/copilotkit (Clio not configured) arrives as
 * runtime_info_fetch_failed (on connect) or agent_run_failed (on a run).
 */
const FAILURE_CODES = new Set([
  'runtime_info_fetch_failed',
  'agent_connect_failed',
  'agent_run_failed',
  'agent_run_failed_event',
  'agent_run_error_event',
  'agent_not_found',
  'agent_thread_locked',
]);

interface CoreErrorEvent {
  code?: string;
  context?: Record<string, unknown>;
}

const GENERIC_FAILURE = "Clio couldn't answer. Check Settings or try again.";

function isChatFailure(e: CoreErrorEvent): boolean {
  if (!e.code || !FAILURE_CODES.has(e.code)) return false;
  // RUN_ERROR replayed from stored history on connect is not a new failure.
  return e.context?.phase !== 'replay';
}

/** Headless Clio chat on top of the nearest ScopedCopilot provider. */
export function ClioChat({ scope, placeholder, chips, mode, empty, sheetTitle, pendingPrompt }: ClioChatProps) {
  const chat = useCopilotChatInternal();
  const { copilotkit } = useCopilotKit();
  const messages = chat.messages as unknown as ChatMessage[];
  const { isLoading, isAvailable, stopGeneration, sendMessage, deleteMessage } = chat;

  const [draft, setDraft] = useState('');
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const lastPromptRef = useRef<string | null>(null);
  const pageInputRef = useRef<HTMLTextAreaElement>(null);
  const sheetInputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();

  // Runtime connection status ('disconnected' | 'connecting' | 'connected' | 'error'),
  // seeded on mount so a ClioChat mounted after the provider already failed still knows.
  const [connStatus, setConnStatus] = useState<string>(() => String(copilotkit?.runtimeConnectionStatus ?? 'connecting'));

  // Surface run / connection failures from this provider's core.
  useEffect(() => {
    if (!copilotkit?.subscribe) return;
    setConnStatus(String(copilotkit.runtimeConnectionStatus ?? 'connecting'));
    const sub = copilotkit.subscribe({
      onError: (e: CoreErrorEvent) => {
        if (isChatFailure(e)) setFailed(true);
      },
      onRuntimeConnectionStatusChanged: ({ status }: { status: string }) => setConnStatus(String(status)),
    });
    return () => sub.unsubscribe();
  }, [copilotkit]);

  // On a failure, ask the server why (the run error itself doesn't reach us with a usable cause).
  useEffect(() => {
    if (!failed) {
      setReason(null);
      return;
    }
    let live = true;
    apiFetch<KeyTest>('/api/settings/test-key', { method: 'POST' })
      .then((r) => live && setReason(failureReason(r)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [failed]);

  // Sheet mode moves the composer into the sheet: keep focus on whichever textarea is showing.
  const prevSheetOpen = useRef(sheetOpen);
  useEffect(() => {
    if (prevSheetOpen.current === sheetOpen) return;
    prevSheetOpen.current = sheetOpen;
    if (sheetOpen) {
      sheetInputRef.current?.focus();
    } else {
      const active = document.activeElement;
      const lost = !active || active === document.body || !active.isConnected;
      if (lost) pageInputRef.current?.focus();
    }
  }, [sheetOpen]);

  // A run finished (true -> false): tell the screens to refetch, once per run.
  const wasLoading = useRef(isLoading);
  useEffect(() => {
    if (wasLoading.current && !isLoading) emitDataChanged('all');
    wasLoading.current = isLoading;
  }, [isLoading]);

  // The runtime came back (e.g. Clio was configured): drop a stale alert.
  const wasAvailable = useRef(isAvailable);
  useEffect(() => {
    if (!wasAvailable.current && isAvailable) setFailed(false);
    wasAvailable.current = isAvailable;
  }, [isAvailable]);

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || !isAvailable) return;
      lastPromptRef.current = content;
      setFailed(false);
      if (mode === 'sheet') setSheetOpen(true);
      try {
        await sendMessage({ id: newUuid(), role: 'user', content });
      } catch {
        setFailed(true);
      }
    },
    [isAvailable, mode, sendMessage],
  );

  const sentPromptId = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingPrompt || sentPromptId.current === pendingPrompt.id || !isAvailable) return;
    sentPromptId.current = pendingPrompt.id;
    void send(pendingPrompt.text);
  }, [pendingPrompt, isAvailable, send]);

  const visible = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const lastUser = [...visible].reverse().find(m => m.role === 'user');
  const retryPrompt = lastPromptRef.current ?? (lastUser ? messageText(lastUser.content) : '');

  const retry = () => {
    if (!retryPrompt) return;
    // Drop the unanswered copy so the resend doesn't duplicate it in the thread.
    const last = visible[visible.length - 1];
    if (last && last.role === 'user' && messageText(last.content).trim() === retryPrompt) deleteMessage?.(last.id);
    void send(retryPrompt);
  };

  const canSend = draft.trim().length > 0 && isAvailable && !isLoading;
  const submit = () => {
    if (!canSend) return;
    const text = draft;
    setDraft('');
    void send(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const alertCls = 'flex items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-ink';
  let alert: ReactNode = null;
  if (failed) {
    alert = (
      <div role="alert" className={alertCls}>
        <span>
          {reason ?? GENERIC_FAILURE}{' '}
          <a href="#/settings" className="font-semibold text-[var(--primary)] underline">
            Open Settings
          </a>
        </span>
        {retryPrompt ? (
          <button
            type="button"
            onClick={retry}
            disabled={!isAvailable || isLoading}
            className="shrink-0 rounded-lg border border-error/30 px-4 py-2 text-sm font-semibold text-error disabled:opacity-50"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  } else if (!isAvailable && connStatus === 'error') {
    // The runtime refused (e.g. 503: not configured). Derived from the live status,
    // so it does not depend on having caught the one-shot error event.
    alert = (
      <div role="alert" className={alertCls}>
        <span>Clio isn't available. Check Settings.</span>
      </div>
    );
  } else if (!isAvailable) {
    alert = (
      <p role="status" className="px-1 text-xs text-ink-muted">
        Connecting…
      </p>
    );
  }

  const chipRow = chips.length ? (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
      {chips.map(c => (
        <button
          key={c.label}
          type="button"
          onClick={() => void send(c.prompt)}
          disabled={!isAvailable || isLoading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2.5 text-sm font-semibold text-ink-soft shadow-card transition-colors hover:bg-inset disabled:opacity-50"
        >
          <Sparkles aria-hidden="true" size={14} className="text-ember" />
          {c.label}
        </button>
      ))}
    </div>
  ) : null;

  const renderComposer = (inputRef: RefObject<HTMLTextAreaElement>) => (
    <form
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
      className="glass flex items-end gap-2 rounded-xl border border-hairline p-2 shadow-card"
    >
      <label htmlFor={inputId} className="sr-only">
        Message Clio
      </label>
      <textarea
        ref={inputRef}
        id={inputId}
        rows={Math.min(5, Math.max(1, draft.split('\n').length))}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        data-scope={scope}
        className="max-h-40 min-h-[3rem] flex-1 resize-none bg-transparent px-3 py-3 text-base leading-normal text-ink placeholder:text-ink-muted focus:outline-none"
      />
      {isLoading ? (
        <button
          type="button"
          aria-label="Stop"
          onClick={() => stopGeneration()}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-hairline bg-inset text-ink"
        >
          <Square aria-hidden="true" size={14} fill="currentColor" />
        </button>
      ) : null}
      <button
        type="submit"
        aria-label="Send"
        disabled={!canSend}
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal text-on-teal shadow-card transition-opacity disabled:opacity-40"
      >
        <Send aria-hidden="true" size={18} />
      </button>
    </form>
  );

  // Sheet mode docks the composer above the bottom navigation; track its height for the spacer.
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const measure = () => setDockHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  const thread = <MessageList messages={messages} isLoading={isLoading} empty={empty} />;

  if (mode === 'full') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{thread}</div>
        <div className="shrink-0 space-y-2 px-4 pb-4">
          {alert}
          {chipRow}
          {renderComposer(pageInputRef)}
        </div>
      </div>
    );
  }

  // Sheet mode: the composer lives on the page; the thread opens in a sheet.
  // The sheet is modal, so while it is open the composer moves inside it.
  const renderControls = (inputRef: RefObject<HTMLTextAreaElement>) => (
    <div className="space-y-2">
      {alert}
      {chipRow}
      {renderComposer(inputRef)}
    </div>
  );
  return (
    <div>
      {/* Reserve the docked composer's height so the page can scroll content clear of it. */}
      <div aria-hidden="true" style={{ height: dockHeight }} />
      <div
        ref={dockRef}
        className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-3xl space-y-2 px-4 pb-2 pt-2"
      >
      {!sheetOpen && visible.length > 0 ? (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-card px-4 py-2 text-sm font-semibold text-[var(--primary)] shadow-card"
        >
          <MessageCircle aria-hidden="true" size={14} />
          Conversation
        </button>
      ) : null}
      {sheetOpen ? null : renderControls(pageInputRef)}
      </div>
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={sheetTitle ?? 'Clio'}>
        <div className="flex flex-col gap-4">
          {thread}
          <div className="sticky bottom-0 bg-card pt-2">{renderControls(sheetInputRef)}</div>
        </div>
      </Sheet>
    </div>
  );
}
