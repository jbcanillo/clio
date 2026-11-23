interface Props {
  title: string;
  detail?: string;
  onApprove: () => void;
  onCancel: () => void;
}

export function ConfirmCard({ title, detail, onApprove, onCancel }: Props) {
  return (
    <div className="ai-card p-4 space-y-2" role="alertdialog" aria-label={title}>
      <div className="font-semibold text-ink">{title}</div>
      {detail && <div className="text-sm text-ink-soft">{detail}</div>}
      <div className="flex gap-2 justify-end">
        <button className="btn btn-ghost btn-sm text-[var(--primary)]" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm h-12 min-h-12 rounded-full border-0 bg-teal px-6 text-white hover:opacity-90" onClick={onApprove}>Approve</button>
      </div>
    </div>
  );
}
