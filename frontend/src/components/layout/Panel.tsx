import { useId, type ReactNode } from 'react';

/** A titled card that groups one area of a page (used by Settings and Privacy). */
export function Panel({ title, description, icon, children, id }: { title: string; description?: string; icon?: ReactNode; children: ReactNode; id?: string }) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className="space-y-4 rounded-2xl border border-hairline bg-card p-4 shadow-card sm:p-5">
      <header>
        <h2 id={headingId} className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          {icon ? <span aria-hidden="true" className="inline-flex text-[var(--primary)]">{icon}</span> : null}
          {title}
        </h2>
        {description ? <p className="mt-1 text-xs text-ink-soft">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
