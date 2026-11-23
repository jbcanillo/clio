import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MoodPoint } from '../../lib/types';

export function MoodChart({ series }: { series: MoodPoint[] }) {
  if (!series.some((p) => typeof p.mood === 'number')) {
    return <p className="text-sm text-ink-soft">No mood entries yet.</p>;
  }
  return (
    <div style={{ width: '100%', height: 180 }} aria-label="Mood over time">
      <ResponsiveContainer>
        <LineChart data={series}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} fontSize={11} />
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} width={24} fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey="mood" stroke="#0D4C55" strokeWidth={2.5} connectNulls dot={{ r: 4, fill: '#FF6B35', stroke: '#FF6B35' }} activeDot={{ r: 6, fill: '#FF6B35', stroke: '#FF6B35' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
