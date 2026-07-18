// Everything a judge (or a curious student) might want to verify, kept out of the main flow:
// a plain-English description of the four layers, the honest synthetic-cohort validation numbers,
// the anti-hardcode profile tests, a way to replay any scripted student, and the optional live-Claude
// key. Collapsed by default so the app reads as an app, not a presentation.

import { useMemo } from 'react';
import { DEMO_PROFILES } from '../data/demoProfiles.js';
import { toObservation } from '../data/questions.js';
import { diagnose } from '../engine/diagnosis.js';
import { runValidation } from '../engine/validation.js';
import { skillName } from '../data/skills.js';

const LAYERS = [
  ['Track', 'Bayesian Knowledge Tracing keeps a live mastery estimate for each of 20 skills.'],
  ['Diagnose', 'A posterior over every possible root-cause skill; the winner is the earliest gap the evidence supports.'],
  ['Ask', 'The next question is the one with the highest expected information gain, chosen to separate the leading suspects.'],
  ['Reteach + verify', 'Claude writes the micro-lesson from the diagnosed misconception; a follow-up question re-measures mastery.'],
];

export default function HowItWorks({ skillIds, graph, hypotheses, params, apiKey, setApiKey, onDemo }) {
  const tests = useMemo(
    () =>
      DEMO_PROFILES.map((p) => {
        const obs = p.answers.map(([q, c]) => toObservation(q, c));
        const d = diagnose(obs, skillIds, graph, { hypotheses, params });
        const pass = p.expected === 'insufficient' ? !d.sufficient : d.sufficient && d.keystone === p.expected;
        const got = d.sufficient ? skillName(d.keystone) : 'insufficient evidence';
        return { id: p.id, expected: p.expected, got, pass };
      }),
    [skillIds, graph, hypotheses, params],
  );

  const val = useMemo(() => runValidation(skillIds, params), [skillIds, params]);
  const models = [val.models.bkt, val.models.previousAnswer, val.models.majority];
  const bestAuc = Math.max(...models.map((m) => m.auc));

  return (
    <details className="collapsible how">
      <summary>How Keystone works, and how to check it</summary>

      <div className="how-grid">
        {LAYERS.map(([t, d], i) => (
          <div className="how-cell" key={t}>
            <div className="how-n">{i + 1}</div>
            <div><b>{t}</b><p>{d}</p></div>
          </div>
        ))}
      </div>

      {onDemo && (
        <div className="how-block">
          <div className="how-h">Replay a worked example</div>
          <div className="demo-row">
            {DEMO_PROFILES.map((p) => (
              <button key={p.id} className="sm" onClick={() => onDemo(p.id)} title={p.label}>
                {p.label.split(':')[0]} · {p.expected === 'insufficient' ? 'stays unsure' : skillName(p.expected)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="how-block">
        <div className="how-h">Anti-hardcode tests <span className="muted">· each scripted student run through the full engine</span></div>
        {tests.map((t) => (
          <div className="test-row" key={t.id}>
            <span className={`test-badge ${t.pass ? 'pass' : 'fail'}`}>{t.pass ? 'PASS' : 'FAIL'}</span>
            <span>Student {t.id} → {t.got}</span>
            <span className="exp">expected {t.expected === 'insufficient' ? 'insufficient evidence' : skillName(t.expected)}</span>
          </div>
        ))}
      </div>

      <div className="how-block">
        <div className="how-h">
          Model validation <span className="synthetic-flag">synthetic cohort, not real students</span>
        </div>
        <table className="val">
          <thead><tr><th>Model</th><th>AUC</th><th>Accuracy</th><th>Brier ↓</th></tr></thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.name} className={m.auc === bestAuc ? 'best' : ''}>
                <td>{m.name}</td><td>{m.auc.toFixed(3)}</td><td>{m.accuracy.toFixed(3)}</td><td>{m.brier.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="val-note">
          {val.nHeldout.toLocaleString()} held-out predictions from {val.nStudents.toLocaleString()} students
          simulated by the misconception model, a calibration check on synthetic data, not real-world accuracy.
          The held-out evaluation on a public dataset lives in <span className="mono">evaluation/</span>.
        </p>
      </div>

      <div className="how-block">
        <div className="how-h">Live lesson generation <span className="muted">· optional</span></div>
        <p className="val-note">
          Lessons use a deterministic fallback by default so nothing depends on the network. To have Claude
          write them live, paste an Anthropic API key (kept in memory only, never stored):{' '}
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-… (optional)" />
        </p>
      </div>
    </details>
  );
}
