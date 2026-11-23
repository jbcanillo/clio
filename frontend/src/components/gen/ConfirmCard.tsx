interface Props {
  title: string;
  detail?: string;
  onApprove: () => void;
  onCancel: () => void;
}

export function ConfirmCard({ title, detail, onApprove, onCancel }: Props) {
  return (
    <div className="card bg-base-200 p-4 space-y-2" role="alertdialog" aria-label={title}>
      <div className="font-medium">{title}</div>
      {detail && <div className="text-sm opacity-80">{detail}</div>}
      <div className="flex gap-2 justify-end">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onApprove}>Approve</button>
      </div>
    </div>
  );
}
