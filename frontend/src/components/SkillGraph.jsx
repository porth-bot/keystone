import { useMemo } from 'react';

// Layered left-to-right prerequisite graph. Nodes are colored by BKT mastery. Before a diagnosis it
// shows the whole map faintly; on the reveal it dims everything except the keystone (pulsing ring)
// and its blocked downstream path (red), so the "one root cause -> many broken skills" story reads
// at a glance instead of as 20-node clutter.

const COL_W = 168;
const ROW_H = 62;
const NODE_W = 132;
const NODE_H = 34;
const PAD_X = 16;
const PAD_Y = 22;

function masteryFill(L) {
  if (L < 0.4) return '#f8e6e2';
  if (L < 0.7) return '#f8eecf';
  return '#e6f3ea';
}
function masteryStroke(L) {
  if (L < 0.4) return '#c8433f';
  if (L < 0.7) return '#bd7d0a';
  return '#2f8f5f';
}

export default function SkillGraph({ skills, edges, mastery, reveal, assessed }) {
  const known = assessed ?? new Set();
  const { pos, width, height } = useMemo(() => {
    const tiers = {};
    for (const s of skills) (tiers[s.tier] ??= []).push(s);
    const tierKeys = Object.keys(tiers).map(Number).sort((a, b) => a - b);
    const maxRows = Math.max(...tierKeys.map((t) => tiers[t].length));
    const pos = {};
    for (const t of tierKeys) {
      const col = tiers[t];
      const colX = PAD_X + t * COL_W;
      const totalH = col.length * ROW_H;
      const startY = PAD_Y + (maxRows * ROW_H - totalH) / 2;
      col.forEach((s, i) => {
        pos[s.id] = { x: colX, y: startY + i * ROW_H, cx: colX + NODE_W / 2, cy: startY + i * ROW_H + NODE_H / 2 };
      });
    }
    return {
      pos,
      width: PAD_X * 2 + (tierKeys.length - 1) * COL_W + NODE_W,
      height: PAD_Y * 2 + maxRows * ROW_H,
    };
  }, [skills]);

  const impaired = useMemo(() => new Set(reveal?.impaired ?? []), [reveal]);
  const keystone = reveal?.keystone ?? null;
  const dim = (id) => (reveal?.sufficient && !impaired.has(id) ? 0.28 : 1);

  return (
    <div className="graph-wrap">
      <svg className="graph-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Prerequisite skill graph">
        {edges.map(([a, b], i) => {
          const p = pos[a];
          const c = pos[b];
          if (!p || !c) return null;
          const x1 = p.x + NODE_W;
          const y1 = p.cy;
          const x2 = c.x;
          const y2 = c.cy;
          const mx = (x1 + x2) / 2;
          const hot = reveal?.sufficient && impaired.has(a) && impaired.has(b);
          const faded = reveal?.sufficient && !hot;
          return (
            <path
              key={i}
              className={`edge${hot ? ' hot' : ''}`}
              style={{ opacity: faded ? 0.15 : hot ? 1 : 0.9 }}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            />
          );
        })}

        {skills.map((s) => {
          const p = pos[s.id];
          const L = mastery[s.id] ?? 0.3;
          const isKey = s.id === keystone;
          const isImpaired = impaired.has(s.id) && !isKey;
          const isKnown = known.has(s.id);
          // Untested skills stay neutral so the coloring only ever means "evidence says so".
          let fill = '#f4efe4';
          let stroke = '#d8d1c1';
          let sw = 1.1;
          let labelInk = true;
          if (isKey) { fill = '#f6ecd6'; stroke = '#a9721a'; sw = 2.4; }
          else if (reveal?.sufficient && isImpaired) { fill = masteryFill(L); stroke = '#c8433f'; sw = 1.8; }
          else if (isKnown) { fill = masteryFill(L); stroke = masteryStroke(L); sw = 1.3; }
          else { labelInk = false; }
          return (
            <g key={s.id} style={{ opacity: dim(s.id) }}>
              {isKey && (
                <rect
                  className="keystone-ring"
                  x={p.x - 4}
                  y={p.y - 4}
                  width={NODE_W + 8}
                  height={NODE_H + 8}
                  rx={11}
                  style={{ animation: 'pulse 1.6s ease-in-out infinite' }}
                />
              )}
              <rect
                className="node-rect"
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill={fill}
                stroke={stroke}
                strokeWidth={sw}
              />
              <text
                className="node-label"
                x={p.cx}
                y={p.cy + 3}
                textAnchor="middle"
                style={{ fill: labelInk ? 'var(--ink)' : 'var(--muted)' }}
              >
                {s.name.length > 22 ? s.name.slice(0, 21) + '…' : s.name}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="graph-legend">
        <span><i className="legend-dot" style={{ background: '#2f8f5f' }} /> mastered</span>
        <span><i className="legend-dot" style={{ background: '#bd7d0a' }} /> partial</span>
        <span><i className="legend-dot" style={{ background: '#c8433f' }} /> weak</span>
        <span><i className="legend-dot" style={{ background: '#a9721a' }} /> keystone</span>
      </div>
    </div>
  );
}
