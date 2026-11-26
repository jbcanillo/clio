import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  /** One short line on what this page is for. */
  subtitle: string;
  /** Primary page action, shown on the right (e.g. a "+" button). */
  action?: ReactNode;
  /** Extra content under the subtitle (status pills and the like). */
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, children, className = 'mb-4' }: PageHeaderProps) {
  return (
    <header className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-bold leading-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
