import { memo } from 'react';

// The banner's night sky: scattered stars plus two constellation clusters on the left and right edges,
// in teal and ember. Seeded, so the sky is the same on every load. Decorative only.

const W = 1200;
const H = 800;

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Star = { x: number; y: number; r: number; o: number; ember: boolean; twinkle: boolean; delay: number };

function buildSky() {
  const rand = rng(42);
  const dust: Star[] = Array.from({ length: 140 }, () => ({
    x: rand() * W,
    y: rand() * H,
    r: 0.4 + rand() * 0.9,
    o: 0.15 + rand() * 0.5,
    ember: rand() > 0.85,
    twinkle: rand() > 0.8,
    delay: rand() * 4,
  }));

  // Constellation clusters hug the sides so the content column stays calm.
  const cluster = (cx: number, cy: number, n: number, spread: number) =>
    Array.from({ length: n }, () => ({
      x: cx + (rand() - 0.5) * spread,
      y: cy + (rand() - 0.5) * spread * 1.3,
      r: 1 + rand() * 1.6,
      o: 0.55 + rand() * 0.45,
      ember: rand() > 0.55,
      twinkle: rand() > 0.5,
      delay: rand() * 4,
    }));
  const nodes = [...cluster(140, 420, 16, 300), ...cluster(1060, 300, 18, 320)];

  // Link each node to its nearest two neighbours.
  const links = new Set<string>();
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .filter((e) => e.j !== i && e.d < 160 ** 2)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach(({ j }) => links.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  const lines = [...links].map((k) => k.split('-').map(Number) as [number, number]);
  return { dust, nodes, lines };
}

const SKY = buildSky();

function CosmicBackdrop() {
  const { dust, nodes, lines } = SKY;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-40 dark:opacity-100">
      <svg className="h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {dust.map((s, i) => (
          <circle
            key={`d${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            className={`${s.ember ? 'fill-ember' : 'fill-teal-light dark:fill-white'} ${s.twinkle ? 'star-twinkle' : ''}`}
            style={{ opacity: s.o, animationDelay: `${s.delay}s` }}
          />
        ))}
        <g className="stroke-teal-light dark:stroke-[#3FA6B4]" strokeWidth={0.6} opacity={0.35}>
          {lines.map(([a, b], i) => (
            <line
              key={`l${i}`}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              className={nodes[a].ember && nodes[b].ember ? 'stroke-ember' : undefined}
            />
          ))}
        </g>
        {nodes.map((s, i) => (
          <g key={`n${i}`} className={s.twinkle ? 'star-twinkle' : undefined} style={{ animationDelay: `${s.delay}s` }}>
            <circle cx={s.x} cy={s.y} r={s.r * 3.2} className={s.ember ? 'fill-ember' : 'fill-[#3FA6B4]'} opacity={0.18} />
            <circle cx={s.x} cy={s.y} r={s.r} className={s.ember ? 'fill-ember' : 'fill-[#3FA6B4]'} opacity={s.o} />
          </g>
        ))}
      </svg>
    </div>
  );
}

export default memo(CosmicBackdrop);
