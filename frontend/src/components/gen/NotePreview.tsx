interface Props {
  title: string;
  body: string;
  onSave: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}

export function NotePreview({ title, body, onSave, onEdit, onDiscard }: Props) {
  return (
    <div className="ai-card p-4 space-y-2">
      <div className="font-semibold text-ink">{title}</div>
      {/* Rendered as text on purpose: note content is never interpreted as HTML. */}
      <pre className="whitespace-pre-wrap text-sm font-sans text-ink-soft">{body}</pre>
      <div className="flex gap-2 justify-end">
        <button className="btn btn-ghost btn-sm text-[var(--primary)]" onClick={onDiscard}>Discard</button>
        <button className="btn btn-ghost btn-sm text-[var(--primary)]" onClick={onEdit}>Edit</button>
        <button className="btn btn-sm border-0 bg-ember text-white hover:opacity-90" onClick={onSave}>Save to vault</button>
      </div>
    </div>
  );
}
