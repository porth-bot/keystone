import { useMemo, useState } from 'react';

import { SKILLS, skillName } from './data/skills.js';
import { EDGES } from './data/edges.js';
import { QUESTIONS, QUESTION_BY_ID, toObservation } from './data/questions.js';
import { DEMO_PROFILES } from './data/demoProfiles.js';
import params from './data/parameters.json';

import { buildGraph } from './engine/graph.js';
import { buildHypotheses, diagnose } from './engine/diagnosis.js';
import { selectNextQuestion } from './engine/selection.js';
import { runBKT, paramsFor, updateBKT, pCorrect } from './engine/bkt.js';
import { generateIntervention } from './services/claude.js';

import SkillGraph from './components/SkillGraph.jsx';
import DiagnosticQuestion from './components/DiagnosticQuestion.jsx';
import EvidencePanel from './components/EvidencePanel.jsx';
import InterventionPanel from './components/InterventionPanel.jsx';
import TeacherSummary from './components/TeacherSummary.jsx';
import ValidationPanel from './components/ValidationPanel.jsx';

const SKILL_IDS = SKILLS.map((s) => s.id);

export default function App() {
  const graph = useMemo(() => buildGraph(SKILL_IDS, EDGES), []);
  const hypotheses = useMemo(() => buildHypotheses(SKILL_IDS, graph, {}), [graph]);

  const [profileId, setProfileId] = useState(null);
  const [step, setStep] = useState(0); // number of the profile's answers applied so far
  const [revealed, setRevealed] = useState(false);
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verify, setVerify] = useState({ answeredIndex: null, before: 0, after: 0 });
  const [apiKey, setApiKey] = useState('');

  const profile = profileId ? DEMO_PROFILES.find((p) => p.id === profileId) : null;
  const applied = profile ? profile.answers.slice(0, step) : [];
  const observations = useMemo(() => applied.map(([q, c]) => toObservation(q, c)), [applied]);

  const mastery = useMemo(() => runBKT(observations, SKILL_IDS, params), [observations]);
  const diagnosis = useMemo(
    () => diagnose(observations, SKILL_IDS, graph, { hypotheses, params }),
    [observations, graph, hypotheses],
  );

  const lastAnswer = applied.length ? applied[applied.length - 1] : null;
  const lastQuestion = lastAnswer ? QUESTION_BY_ID[lastAnswer[0]] : null;

  const answeredIds = new Set(applied.map(([q]) => q));
  const candidates = QUESTIONS.filter((q) => !answeredIds.has(q.id));
  const next =
    !revealed && profile && step < profile.answers.length && candidates.length
      ? selectNextQuestion(candidates, observations, SKILL_IDS, graph, { hypotheses, params })
      : null;

  const fullyApplied = profile && step >= profile.answers.length;

  function loadProfile(id) {
    setProfileId(id);
    setStep(1);
    setRevealed(false);
    setLesson(null);
    setVerify({ answeredIndex: null, before: 0, after: 0 });
  }
  function reset() {
    setProfileId(null);
    setStep(0);
    setRevealed(false);
    setLesson(null);
    setVerify({ answeredIndex: null, before: 0, after: 0 });
  }

  async function handleGenerate() {
    const keystone = diagnosis.keystone;
    const errorTags = [...new Set(observations.filter((o) => !o.correct && o.errorTag).map((o) => o.errorTag))];
    const masteredPrereqs = graph.ancestors[keystone]
      .filter((s) => (mastery[s] ?? 0) > 0.6)
      .map(skillName);
    const blockedSkills = graph.descendants[keystone].map(skillName);
    const evidence = {
      skill: keystone,
      skillName: skillName(keystone),
      masteryProb: mastery[keystone],
      diagnosticConfidence: diagnosis.top.prob,
      errorTags,
      masteredPrereqs,
      blockedSkills,
    };
    setLoading(true);
    const result = await generateIntervention(evidence, { apiKey: apiKey.trim() || undefined });
    setLesson(result);
    setLoading(false);
  }

  function answerVerification(i) {
    const keystone = diagnosis.keystone;
    const before = mastery[keystone];
    const correct = i === lesson.verification.answerIndex;
    const after = updateBKT(before, correct, paramsFor(params, keystone));
    setVerify({ answeredIndex: i, before, after });
  }

  const revealDiag = revealed ? diagnosis : null;

  return (
    <div className="app">
      <div className="masthead">
        <span className="wordmark"><span className="k">Key</span>stone</span>
        <span className="subject-chip">single-variable calculus</span>
      </div>
      <p className="tagline">
        The visible mistake is rarely the real problem. Keystone finds the <b>prerequisite skill</b> beneath a
        student's errors, reteaches that exact gap, and <b>verifies</b> the fix moved mastery.
      </p>

      <div className="controls">
        <span className="label">Student</span>
        {DEMO_PROFILES.map((p) => (
          <button
            key={p.id}
            className="chip"
            aria-pressed={profileId === p.id}
            onClick={() => loadProfile(p.id)}
            title={p.label}
          >
            Profile {p.id}
          </button>
        ))}
        {profile && !fullyApplied && (
          <button onClick={() => setStep((s) => Math.min(s + 1, profile.answers.length))}>
            Next answer ▸ ({step}/{profile.answers.length})
          </button>
        )}
        <button className="primary" disabled={!observations.length} onClick={() => setRevealed(true)}>
          Diagnose
        </button>
        <div className="spacer" />
        {profile && <button className="ghost" onClick={reset}>Reset</button>}
      </div>

      {profile && (
        <p className="hint" style={{ marginTop: -6, marginBottom: 14 }}>
          {profile.label}
        </p>
      )}

      <div className="grid">
        <div className="panel">
          <h2>Prerequisite graph <span className="layer-tag">· Layer 1: BKT mastery</span></h2>
          <SkillGraph skills={SKILLS} edges={EDGES} mastery={mastery} reveal={revealDiag} />
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <DiagnosticQuestion
            question={lastQuestion}
            chosenIndex={lastAnswer ? lastAnswer[1] : null}
            next={next}
          />
          <EvidencePanel diagnosis={observations.length ? diagnosis : null} nObs={observations.length} />
        </div>
      </div>

      {revealed && diagnosis.sufficient && (
        <>
          <TeacherSummary diagnosis={diagnosis} nObs={observations.length} />
          <div className="wide">
            <InterventionPanel
              lesson={lesson}
              loading={loading}
              onGenerate={handleGenerate}
              canGenerate={revealed && diagnosis.sufficient}
              verify={{ ...verify, onAnswer: answerVerification }}
            />
          </div>
        </>
      )}

      <ValidationPanel skillIds={SKILL_IDS} graph={graph} hypotheses={hypotheses} params={params} />

      <div className="panel wide">
        <p className="api-note">
          Lessons use a deterministic fallback by default so the demo never breaks. To use live Claude,
          paste an Anthropic API key (kept only in memory, never stored):{' '}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-… (optional)"
          />
        </p>
      </div>
    </div>
  );
}
