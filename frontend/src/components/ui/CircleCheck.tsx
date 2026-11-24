import type { KeyboardEvent } from 'react';

export interface CircleCheckProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function CircleCheck({ checked, onChange, label, disabled }: CircleCheckProps) {
  const toggle = () => {
    if (!disabled) onChange(!checked);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  };
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={onKeyDown}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
        checked ? 'border-teal bg-teal' : 'border-ink-muted bg-transparent'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      {checked ? (
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 text-on-teal" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
        </svg>
      ) : null}
    </span>
  );
}
