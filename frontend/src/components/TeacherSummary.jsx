// The one-glance teacher card: how many downstream skills a single keystone unblocks, the
// confidence, and the recommended action. This is the "educational impact, quantified" artifact.

import { skillName } from '../data/skills.js';

export default function TeacherSummary({ diagnosis, nObs }) {
  if (!diagnosis?.sufficient) return null;
  const blocked = diagnosis.impaired.filter((s) => s !== diagnosis.keystone);
  const confidence = Math.round(diagnosis.top.prob * 100);
  return (
    <div className="panel wide">
      <h2>Teacher summary</h2>
      <div className="teacher-grid">
        <div className="stat">
          <div className="n accent">{skillName(diagnosis.keystone)}</div>
          <div className="l">keystone skill to reteach</div>
        </div>
        <div className="stat">
          <div className="n">{blocked.length}</div>
          <div className="l">downstream skills it unblocks</div>
        </div>
        <div className="stat">
          <div className="n">{confidence}%</div>
          <div className="l">diagnostic confidence</div>
        </div>
        <div className="stat">
          <div className="n">{nObs}</div>
          <div className="l">questions of evidence</div>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Recommended action: reteach <b>{skillName(diagnosis.keystone)}</b> directly, then re-check.
        Drilling the visible errors ({blocked.slice(0, 3).map(skillName).join(', ')}
        {blocked.length > 3 ? ', …' : ''}) treats symptoms, not the cause.
      </p>
    </div>
  );
}
