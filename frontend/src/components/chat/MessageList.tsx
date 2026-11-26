import { Check, Sparkles } from 'lucide-react';
import { Fragment, isValidElement, useEffect, useRef, type ReactNode } from 'react';
import { AiBadge } from '../ui/AiBadge';

/** Structural slice of an AG-UI message as returned by useCopilotChatInternal. */
export interface ChatMessage {
  id: string;
  role: string;
  content?: unknown;
  generativeUI?: () => ReactNode;
}

/** Text of a message: a plain string, or the text parts of multimodal content. */
export function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(p => (p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' ? String((p as { text?: unknown }).text ?? '') : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** generativeUI() returns an empty wrapper for plain replies; only keep real output. */
function hasContent(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === 'boolean') return false;
  if (typeof node === 'string') return node.length > 0;
  if (typeof node === 'number') return true;
  if (Array.isArray(node)) return node.some(hasContent);
  if (isValidElement(node)) {
    const children = (node.props as { children?: ReactNode }).children;
    // A Fragment only matters for what it holds; any other element counts.
    if (node.type === Fragment) return hasContent(children);
    return true;
  }
  return true;
}

function renderGenerative(m: ChatMessage): ReactNode {
  if (m.role !== 'assistant' || typeof m.generativeUI !== 'function') return null;
  try {
    const out = m.generativeUI();
    return hasContent(out) ? out : null;
  } catch {
    return null;
  }
}

function TypingIndicator() {
  return (
    <div role="status" aria-label="Clio is typing" className="flex items-center gap-2 pl-10">
      <span className="inline-flex items-center gap-1 rounded-2xl rounded-tl-md bg-inset px-3 py-2.5">
        {[0, 150, 300].map(d => (
          <span key={d} aria-hidden="true" className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="inline-flex items-center rounded-full bg-inset px-2.5 py-1 text-xs font-semibold text-ink-soft">Me</span>
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-tr-md bg-teal px-4 py-3 text-sm leading-relaxed text-on-teal shadow-card">
        {text}
      </div>
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
        Delivered <Check aria-hidden="true" size={12} />
      </span>
    </div>
  );
}

/**
 * Generative output can be a component that renders nothing (the coagent bridge
 * on a plain reply), which no static check can see. `empty:hidden` collapses the
 * wrapper in the DOM when that happens, so no blank gap is left behind.
 */
function CardSlot({ card }: { card: ReactNode }) {
  return <div className="min-w-0 empty:hidden">{card}</div>;
}

function ClioMessage({ text, card }: { text: string; card: ReactNode }) {
  if (!text) return <CardSlot card={card} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-on-teal">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <AiBadge />
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{text}</p>
        </div>
      </div>
      {card ? <CardSlot card={card} /> : null}
    </div>
  );
}

export interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  empty?: ReactNode;
}

export function MessageList({ messages, isLoading, empty }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const visible = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const last = visible[visible.length - 1];
  const lastSig = last ? `${last.id}:${messageText(last.content).length}` : '';

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [visible.length, lastSig, isLoading]);

  if (!visible.length && !isLoading) return empty ? <>{empty}</> : null;

  return (
    <div role="log" aria-live="polite" aria-label="Conversation with Clio" className="flex flex-col gap-5">
      {visible.map(m => {
        const text = messageText(m.content);
        if (m.role === 'user') return text ? <UserBubble key={m.id} text={text} /> : null;
        const card = renderGenerative(m);
        if (!text && !card) return null;
        return <ClioMessage key={m.id} text={text} card={card} />;
      })}
      {isLoading ? <TypingIndicator /> : null}
      <div ref={endRef} />
    </div>
  );
}
