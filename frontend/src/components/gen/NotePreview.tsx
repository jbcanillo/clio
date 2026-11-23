interface Props {
  title: string;
  body: string;
  onSave: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}

export function NotePreview({ title, body, onSave, onEdit, onDiscard }: Props) {
  return (
    <div className="card bg-base-200 p-4 space-y-2">
      <div className="font-semibold">{title}</div>
      {/* Rendered as text on purpose: note content is never interpreted as HTML. */}
      <pre className="whitespace-pre-wrap text-sm font-sans">{body}</pre>
      <div className="flex gap-2 justify-end">
        <button className="btn btn-ghost btn-sm" onClick={onDiscard}>Discard</button>
        <button className="btn btn-sm" onClick={onEdit}>Edit</button>
        <button className="btn btn-primary btn-sm" onClick={onSave}>Save to vault</button>
      </div>
    </div>
  );
}
