import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'teal' | 'ember' | 'danger';

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-inset text-ink-soft border-hairline',
  teal: 'bg-teal/10 text-[var(--primary)] border-teal/20',
  ember: 'bg-ember-soft text-ember border-ember/20',
  danger: 'bg-error/10 text-error border-error/20',
};

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  icon?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}

export function Chip({ children, tone = 'neutral', icon, onClick, selected }: ChipProps) {
  const cls = `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${TONES[tone]} ${
    selected ? 'ring-2 ring-teal' : ''
  }`;
  const content = (
    <>
      {icon ? <span aria-hidden="true" className="inline-flex">{icon}</span> : null}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={!!selected} className={`${cls} cursor-pointer transition-colors`}>
        {content}
      </button>
    );
  }
  return <span className={cls}>{content}</span>;
}
