import { useEffect, useMemo, useState } from 'react';

import { SKILLS, skillName } from './data/skills.js';
import { EDGES } from './data/edges.js';
import { QUESTIONS, QUESTION_BY_ID, toObservation } from './data/questions.js';
import { DEMO_PROFILES } from './data/demoProfiles.js';
import params from './data/parameters.json';

import { buildGraph } from './engine/graph.js';
import { buildHypotheses, diagnose, HEALTHY } from './engine/diagnosis.js';
import { selectNextQuestion } from './engine/selection.js';
import { runBKT, paramsFor, updateBKT } from './engine/bkt.js';
import { generateIntervention } from './services/claude.js';

import SkillGraph from './components/SkillGraph.jsx';
import QuestionCard from './components/QuestionCard.jsx';
import ConfidenceGauge from './components/ConfidenceGauge.jsx';
import EvidencePanel from './components/EvidencePanel.jsx';
import InterventionPanel from './components/InterventionPanel.jsx';
import TeacherSummary from './components/TeacherSummary.jsx';
import ValidationPanel from './components/ValidationPanel.jsx';

const SKILL_IDS = SKILLS.map((s) => s.id);
const runnerName = (id) => (id === HEALTHY ? 'no-gap' : skillName(id));

// Humanize the "why not the runner-up" sentence from the log-likelihood-ratio evidence.
function whyNotText(whyNot) {
  if (!whyNot) return '';
  const { keyObservation: o, runnerUp } = whyNot;
  const did = o.correct ? 'solved' : 'missed';
  const pred = o.correct ? 'miss' : 'solve';
  return `The student ${did} a ${skillName(o.skill)} question, which a ${runnerName(runnerUp)} gap predicts they would ${pred}. That rules it out.`;
}

export default function App() {
  const graph = useMemo(() => buildGraph(SKILL_IDS, EDGES), []);
  const hypotheses = useMemo(() => buildHypotheses(SKILL_IDS, graph, {}), [graph]);

  const [phase, setPhase] = useState('start'); // start | session | reveal | lesson
  const [mode, setMode] = useState('interactive'); // interactive | auto
  const [profileId, setProfileId] = useState(null);
  const [answers, setAnswers] = useState([]); // [[questionId, choiceIndex], ...]
  const [answeredCard, setAnsweredCard] = useState(null); // interactive feedback beat
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verify, setVerify] = useState({ answeredIndex: null, before: 0, after: 0 });
  const [apiKey, setApiKey] = useState('');

  const profile = profileId ? DEMO_PROFILES.find((p) => p.id === profileId) : null;
  const profileName = profile ? profile.label.split(/[—:]/)[0].trim() : '';

  const observations = useMemo(() => answers.map(([q, c]) => toObservation(q, c)), [answers]);
  const mastery = useMemo(() => runBKT(observations, SKILL_IDS, params), [observations]);
  const diagnosis = useMemo(
    () => diagnose(observations, SKILL_IDS, graph, { hypotheses, params }),
    [observations, graph, hypotheses],
  );

  const answeredIds = useMemo(() => new Set(answers.map(([q]) => q)), [answers]);
  const nextPick = useMemo(() => {
    if (phase !== 'session' || mode !== 'interactive' || diagnosis.sufficient) return null;
    const candidates = QUESTIONS.filter((q) => !answeredIds.has(q.id));
    if (!candidates.length) return null;
    return selectNextQuestion(candidates, observations, SKILL_IDS, graph, { hypotheses, params });
  }, [phase, mode, diagnosis.sufficient, answeredIds, observations, graph, hypotheses]);

  const autoExhausted = mode === 'auto' && profile && answers.length >= profile.answers.length;
  const insufficientEnd = phase === 'session' && !diagnosis.sufficient && autoExhausted;

  // Auto-play: feed the scripted student's WHOLE session, one answer at a time, so the evidence and
  // confidence visibly build (and the "why not the runner-up" story earns its full strength) before
  // the reveal — rather than cutting off the moment the gate first trips.
  useEffect(() => {
    if (phase !== 'session' || mode !== 'auto' || !profile) return;
    if (answers.length >= profile.answers.length) return;
    const t = setTimeout(
      () => setAnswers((a) => [...a, profile.answers[a.length]]),
      answers.length === 0 ? 450 : 1150,
    );
    return () => clearTimeout(t);
  }, [phase, mode, profile, answers]);

  // Interactive: hold the just-answered card briefly (correct/incorrect feedback) before the next.
  useEffect(() => {
    if (!answeredCard) return;
    const t = setTimeout(() => setAnsweredCard(null), 1050);
    return () => clearTimeout(t);
  }, [answeredCard]);

  // The payoff. Interactive: reveal the moment the gate clears (don't over-ask). Auto: let the whole
  // scripted session play, then reveal if it earned a keystone (Profile D stays on "insufficient").
  useEffect(() => {
    if (phase !== 'session') return;
    const done = mode === 'auto' ? autoExhausted : diagnosis.sufficient;
    if (done && diagnosis.sufficient) {
      const t = setTimeout(() => {
        setAnsweredCard(null);
        setPhase('reveal');
      }, mode === 'auto' ? 750 : 1150);
      return () => clearTimeout(t);
    }
  }, [phase, mode, autoExhausted, diagnosis.sufficient]);

  function startInteractive() {
    setMode('interactive');
    setProfileId(null);
    resetSession();
  }
  function startAuto(id) {
    setMode('auto');
    setProfileId(id);
    resetSession();
  }
  function resetSession() {
    setAnswers([]);
    setAnsweredCard(null);
    setLesson(null);
    setVerify({ answeredIndex: null, before: 0, after: 0 });
    setPhase('session');
  }
  function newSession() {
    setPhase('start');
    setProfileId(null);
    setAnswers([]);
    setAnsweredCard(null);
    setLesson(null);
    setVerify({ answeredIndex: null, before: 0, after: 0 });
  }

  function answerInteractive(i) {
    if (!nextPick) return;
    setAnsweredCard({ question: nextPick.question, choiceIndex: i });
    setAnswers((a) => [...a, [nextPick.question.id, i]]);
  }

  async function handleGenerate() {
    const keystone = diagnosis.keystone;
    const errorTags = [...new Set(observations.filter((o) => !o.correct && o.errorTag).map((o) => o.errorTag))];
    const evidence = {
      skill: keystone,
      skillName: skillName(keystone),
      masteryProb: mastery[keystone],
      diagnosticConfidence: diagnosis.top.prob,
      errorTags,
      masteredPrereqs: graph.ancestors[keystone].filter((s) => (mastery[s] ?? 0) > 0.6).map(skillName),
      blockedSkills: graph.descendants[keystone].map(skillName),
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

  const revealed = phase === 'reveal' || phase === 'lesson';
  const blockedCount = diagnosis.sufficient ? diagnosis.impaired.filter((s) => s !== diagnosis.keystone).length : 0;

  // ---- top-bar status ----
  let status = { dot: '', text: 'No active session' };
  if (phase === 'session' && !insufficientEnd)
    status = { dot: 'live', text: mode === 'auto' ? `Auto-playing ${profileName}` : `Live diagnostic · ${answers.length} answered` };
  else if (insufficientEnd) status = { dot: '', text: 'Insufficient evidence' };
  else if (revealed) status = { dot: 'locked', text: 'Keystone located' };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="brand-glyph" viewBox="0 0 26 26" aria-hidden="true">
            <rect width="26" height="26" rx="7" fill="var(--accent)" />
            <path d="M6.5 7 h13 l-2.6 12 h-7.8 z" fill="var(--paper)" />
          </svg>
          <span className="wordmark"><span className="k">Key</span>stone</span>
        </div>
        <span className="subject-chip">single-variable calculus</span>
        <div className="spacer" />
        {phase !== 'start' && (
          <>
            <span className="session-status">
              <span className={`status-dot ${status.dot}`} />
              {status.text}
            </span>
            <button className="sm" onClick={newSession}>↺ New session</button>
          </>
        )}
      </header>

      <section className="panel map-band">
        <div className="map-head">
          <h2 style={{ margin: 0 }}>
            Knowledge map <span className="layer-tag">· Layer 1 · Bayesian mastery, live</span>
          </h2>
        </div>
        <SkillGraph
          skills={SKILLS}
          edges={EDGES}
          mastery={mastery}
          reveal={revealed ? diagnosis : null}
          assessed={new Set(observations.map((o) => o.skill))}
        />
      </section>

      <div className="work">
        {/* ---- center stage ---- */}
        <div className="main-col" style={{ display: 'grid', gap: 20 }}>
          {phase === 'start' && (
            <div className="panel start">
              <p className="eyebrow">A diagnostic engine, not another tutor</p>
              <h1>
                Find the idea beneath<br />the <em>mistake</em>.
              </h1>
              <p className="lead">
                A student keeps missing the chain rule. Most tools reteach the chain rule. Keystone
                finds the prerequisite the error actually traces back to, reteaches that, and checks
                whether mastery moved.
              </p>
              <div className="start-actions">
                <button className="primary" onClick={startInteractive}>Take the diagnostic ▸</button>
                <span className="or">or watch a sample student</span>
                {DEMO_PROFILES.map((p) => (
                  <button key={p.id} className="chip" onClick={() => startAuto(p.id)} title={p.label}>
                    {p.id}
                  </button>
                ))}
              </div>
              <div className="start-note">
                <div className="mini"><b>Diagnose</b>a Bayesian posterior over every possible root-cause skill.</div>
                <div className="mini"><b>Ask</b>the next question chosen for maximum information gain.</div>
                <div className="mini"><b>Verify</b>re-measure mastery after the fix, or admit it can't tell yet.</div>
              </div>
            </div>
          )}

          {phase === 'session' && mode === 'interactive' && (
            answeredCard ? (
              <QuestionCard
                question={answeredCard.question}
                mode="review"
                chosenIndex={answeredCard.choiceIndex}
                count={`answer ${answers.length}`}
                caption={
                  answeredCard.choiceIndex === answeredCard.question.ans
                    ? 'Recorded as correct. Evidence updated.'
                    : "Recorded as a miss. That's a signal — evidence updated."
                }
              />
            ) : nextPick ? (
              <QuestionCard
                question={nextPick.question}
                mode="answer"
                onAnswer={answerInteractive}
                count={`question ${answers.length + 1}`}
                caption={
                  nextPick.separates.length === 2 ? (
                    <>Adaptive pick · this question best separates <b>{skillName(nextPick.separates[0])}</b> vs <b>{skillName(nextPick.separates[1])}</b>.</>
                  ) : (
                    'Adaptive pick · chosen to shrink uncertainty fastest.'
                  )
                }
              />
            ) : (
              <div className="panel">
                <h2>Out of questions</h2>
                <p className="hint">The bank is exhausted and the evidence still isn't conclusive — Keystone won't force a guess.</p>
              </div>
            )
          )}

          {phase === 'session' && mode === 'auto' && (
            insufficientEnd ? (
              <div className="panel">
                <h2>Insufficient evidence <span className="layer-tag">· the gate holds</span></h2>
                <p className="q-prompt" style={{ fontSize: 20 }}>Keystone won't guess.</p>
                <p className="hint" style={{ fontSize: 14 }}>
                  {diagnosis.reason} A system that only diagnoses when the evidence earns it is one you
                  can trust with the cases where it does.
                </p>
                <button className="ghost sm" style={{ marginTop: 8 }} onClick={newSession}>↺ Try another student</button>
              </div>
            ) : answers.length ? (
              <QuestionCard
                question={QUESTION_BY_ID[answers[answers.length - 1][0]]}
                mode="review"
                chosenIndex={answers[answers.length - 1][1]}
                count={`answer ${answers.length} of ${profile.answers.length}`}
                caption={<>Auto-playing <b>{profileName}</b> — watch the posterior on the right shift with each answer.</>}
              />
            ) : (
              <div className="panel"><h2>Starting session…</h2></div>
            )
          )}

          {revealed && diagnosis.sufficient && (
            <div className="panel reveal">
              <p className="kicker">◆ Root cause located</p>
              <h2 className="keyname">The keystone is <em>{skillName(diagnosis.keystone)}</em>.</h2>
              <p className="keysub">
                It is the earliest skill the evidence flags as weak, and it sits upstream of{' '}
                <b>{blockedCount}</b> skill{blockedCount === 1 ? '' : 's'} the student is getting wrong.
              </p>
              <div className="whyrow">
                <div className="whybox why">
                  <div className="lbl">Why this</div>
                  <div className="body">
                    Confirmed at {Math.round(diagnosis.top.prob * 100)}% after {answers.length} questions.
                    Every wrong answer lies downstream of {skillName(diagnosis.keystone)}; the skills above it tested clean.
                  </div>
                </div>
                {diagnosis.whyNot && (
                  <div className="whybox whynot-box">
                    <div className="lbl">Why not {runnerName(diagnosis.whyNot.runnerUp)}</div>
                    <div className="body">{whyNotText(diagnosis.whyNot)}</div>
                  </div>
                )}
              </div>
              {phase === 'reveal' && (
                <button className="gold" onClick={() => setPhase('lesson')}>Build the targeted fix ▸</button>
              )}
            </div>
          )}

          {revealed && diagnosis.sufficient && <TeacherSummary diagnosis={diagnosis} nObs={answers.length} />}

          {phase === 'lesson' && (
            <InterventionPanel
              lesson={lesson}
              loading={loading}
              onGenerate={handleGenerate}
              canGenerate
              verify={{ ...verify, onAnswer: answerVerification }}
            />
          )}
        </div>

        {/* ---- live readout ---- */}
        <div className="side-col">
          <div className="panel">
            <h2>Diagnostic confidence <span className="layer-tag">· Layer 2</span></h2>
            <ConfidenceGauge
              prob={diagnosis.top?.prob ?? 0}
              leadName={diagnosis.top ? (diagnosis.top.id === HEALTHY ? 'no clear gap' : skillName(diagnosis.top.id)) : ''}
              locked={revealed && diagnosis.sufficient}
              active={answers.length > 0}
            />
          </div>
          <EvidencePanel diagnosis={answers.length ? diagnosis : null} nObs={answers.length} whyNotText={whyNotText} />
        </div>
      </div>

      <div className="footer">
        <ValidationPanel skillIds={SKILL_IDS} graph={graph} hypotheses={hypotheses} params={params} />
        <p className="api-note">
          Lessons run on a deterministic fallback by default so the demo never breaks. To generate them
          live with Claude, paste an Anthropic API key (held in memory only, never stored):{' '}
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
