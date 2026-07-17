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
  if (L < 0.4) return '#fdecec';
  if (L < 0.7) return '#fff4e0';
  return '#e7f6ee';
}
function masteryStroke(L) {
  if (L < 0.4) return '#e5484d';
  if (L < 0.7) return '#e08a00';
  return '#2f9e6b';
}

export default function SkillGraph({ skills, edges, mastery, reveal }) {
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
                fill={isKey ? '#eeecfe' : masteryFill(L)}
                stroke={isKey ? '#5b4bef' : isImpaired ? '#e5484d' : masteryStroke(L)}
                strokeWidth={isKey ? 2.4 : isImpaired ? 1.8 : 1.2}
              />
              <text className="node-label" x={p.cx} y={p.cy + 3} textAnchor="middle">
                {s.name.length > 22 ? s.name.slice(0, 21) + '…' : s.name}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="graph-legend">
        <span><i className="legend-dot" style={{ background: '#2f9e6b' }} /> mastered</span>
        <span><i className="legend-dot" style={{ background: '#e08a00' }} /> partial</span>
        <span><i className="legend-dot" style={{ background: '#e5484d' }} /> weak</span>
        <span><i className="legend-dot" style={{ background: '#5b4bef' }} /> keystone</span>
      </div>
    </div>
  );
}
