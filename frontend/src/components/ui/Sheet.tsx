import { useEffect, useRef, type ReactNode } from 'react';
import { Portal } from './Portal';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div data-testid="sheet-backdrop" className="absolute inset-0 bg-black/40" onClick={() => onCloseRef.current()} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative max-h-[90dvh] w-full max-w-lg animate-slide-up overflow-y-auto rounded-t-3xl border border-hairline bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-ink shadow-modal outline-none sm:rounded-3xl"
      >
        <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
    </Portal>
  );
}
