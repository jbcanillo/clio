interface Props {
  mine: string;
  theirs: string;
  onKeepMine: () => void;
  onKeepTheirs: () => void;
  onKeepBoth: () => void;
}

export function ConflictCard({ mine, theirs, onKeepMine, onKeepTheirs, onKeepBoth }: Props) {
  return (
    <div className="card bg-base-200 p-4 space-y-2" role="group" aria-label="Edit conflict">
      <div className="font-medium">This note changed in two places</div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><div className="text-xs opacity-70 mb-1">Your edit (this device)</div><pre className="whitespace-pre-wrap font-sans">{mine}</pre></div>
        <div><div className="text-xs opacity-70 mb-1">In your vault</div><pre className="whitespace-pre-wrap font-sans">{theirs}</pre></div>
      </div>
      <div className="flex gap-2 justify-end flex-wrap">
        <button className="btn btn-sm" onClick={onKeepTheirs}>Keep theirs</button>
        <button className="btn btn-sm" onClick={onKeepMine}>Keep mine</button>
        <button className="btn btn-primary btn-sm" onClick={onKeepBoth}>Keep both</button>
      </div>
    </div>
  );
}
