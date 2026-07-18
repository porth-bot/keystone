// Layer 2 made visible: the uncertainty meter (posterior entropy), the ranked hypotheses, and the
// gate verdict. On a confident diagnosis it shows "why this / why not the runner-up" — the sentence
// that falls out of the largest log-likelihood ratio between the winner and the runner-up.

import { skillName } from '../data/skills.js';
import { HEALTHY } from '../engine/diagnosis.js';

export default function EvidencePanel({ diagnosis, nObs }) {
  if (!diagnosis) {
    return (
      <div className="panel">
        <h2>Evidence <span className="layer-tag">· Layer 2: root-cause posterior</span></h2>
        <div className="empty-state">
          <span className="empty-number">02</span>
          <div><b>Make uncertainty visible.</b><p>Every answer updates a ranked set of explanations. Keystone only reveals a gap when the evidence is strong enough.</p></div>
        </div>
      </div>
    );
  }
  const { posterior, entropy, sufficient, reason, whyNot } = diagnosis;
  const maxEntropy = Math.log2(posterior.length);
  const uncertaintyPct = Math.round((entropy / maxEntropy) * 100);
  const top5 = posterior.slice(0, 5);

  return (
    <div className="panel">
      <h2>Evidence <span className="layer-tag">· Layer 2: root-cause posterior</span></h2>

      <div className="uncertainty">
        <div className="meter"><span style={{ width: `${uncertaintyPct}%` }} /></div>
        <div className="meter-labels">
          <span>uncertainty {uncertaintyPct}%</span>
          <span>{nObs} observation{nObs === 1 ? '' : 's'}</span>
        </div>
      </div>

      {top5.map((h) => {
        const isHealthy = h.id === HEALTHY;
        const lead = h === posterior[0];
        return (
          <div className={`hyp${lead ? ' lead' : ''}`} key={h.id}>
            <div className="hyp-row">
              <span className={`hyp-name${isHealthy ? ' healthy' : ''}`}>
                {isHealthy ? 'no clear gap' : skillName(h.id)}
              </span>
              <span className="hyp-bar"><span style={{ width: `${Math.round(h.prob * 100)}%` }} /></span>
              <span className="pct">{Math.round(h.prob * 100)}%</span>
            </div>
          </div>
        );
      })}

      <div className={`verdict ${sufficient ? 'found' : 'needs'}`}>
        {sufficient ? (
          <>
            <span className="kw">Keystone found:</span> {skillName(diagnosis.keystone)}. {reason}
          </>
        ) : (
          <>
            <span className="kw">More evidence needed.</span> {reason}
          </>
        )}
      </div>

      {sufficient && whyNot && (
        <div className="whynot">
          <span className="lbl">Why not {skillName(whyNot.runnerUp)}?</span> {whyNot.sentence}
        </div>
      )}
    </div>
  );
}
