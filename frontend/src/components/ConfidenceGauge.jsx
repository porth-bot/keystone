// A live radial readout of the engine's leading hypothesis. It fills as evidence accumulates and
// turns gold + "locked" the moment the insufficient-evidence gate is cleared. Purely a view of the
// diagnosis object — no logic of its own.

const SIZE = 118;
const STROKE = 11;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export default function ConfidenceGauge({ prob = 0, leadName, locked = false, active = false }) {
  const pct = Math.round(prob * 100);
  const offset = C * (1 - prob);
  const state = locked ? 'keystone locked in' : active ? 'gathering evidence' : 'awaiting first answer';

  return (
    <div className="gauge-card">
      <div className="gauge">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle className="gauge-track" cx={SIZE / 2} cy={SIZE / 2} r={R} />
          <circle
            className={`gauge-arc${locked ? ' locked' : ''}`}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            strokeDasharray={C}
            strokeDashoffset={active ? offset : C}
          />
        </svg>
        <div className="gauge-center">
          <div className="gauge-pct">{active ? pct : '—'}<span className="u">%</span></div>
          <div className="gauge-sub">confidence</div>
        </div>
      </div>
      <div className="gauge-meta">
        <div className="lbl">leading cause</div>
        <div className={`lead-name${locked ? ' locked' : ''}`}>{active ? leadName : 'not yet'}</div>
        <div className="state">{state}</div>
      </div>
    </div>
  );
}
