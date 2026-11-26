export function AiBadge({ label = 'Clio' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-soft px-2.5 py-1 text-xs font-semibold text-ember">
      <style>{'@media (prefers-reduced-motion: reduce){.clio-ai-dot{animation:none!important}}'}</style>
      <span aria-hidden="true" className="clio-ai-dot h-1.5 w-1.5 rounded-full bg-ember animate-pulse" />
      {label}
    </span>
  );
}
