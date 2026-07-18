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

import QuestionCard from './components/QuestionCard.jsx';
import HowItWorks from './components/HowItWorks.jsx';

const SKILL_IDS = SKILLS.map((s) => s.id);
const MIN_QUESTIONS = 4; // matches the engine's insufficient-evidence gate
const clean = (t) => (t ? t.replaceAll(' — ', ', ') : t);

export default function App() {
  const graph = useMemo(() => buildGraph(SKILL_IDS, EDGES), []);
  const hypotheses = useMemo(() => buildHypotheses(SKILL_IDS, graph, {}), [graph]);

  const [screen, setScreen] = useState('home'); // home | quiz | diagnosis | lesson | verify
  const [mode, setMode] = useState('live'); // live | demo
  const [profileId, setProfileId] = useState(null);
  const [answers, setAnswers] = useState([]); // [[questionId, choiceIndex], ...]
  const [answeredCard, setAnsweredCard] = useState(null); // brief feedback beat
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verify, setVerify] = useState({ answeredIndex: null, before: 0, after: 0 });
  const [apiKey, setApiKey] = useState('');

  const profile = profileId ? DEMO_PROFILES.find((p) => p.id === profileId) : null;

  const observations = useMemo(() => answers.map(([q, c]) => toObservation(q, c)), [answers]);
  const mastery = useMemo(() => runBKT(observations, SKILL_IDS, params), [observations]);
  const diagnosis = useMemo(
    () => diagnose(observations, SKILL_IDS, graph, { hypotheses, params }),
    [observations, graph, hypotheses],
  );

  const answeredIds = useMemo(() => new Set(answers.map(([q]) => q)), [answers]);
  const nextPick = useMemo(() => {
    if (screen !== 'quiz' || mode !== 'live' || diagnosis.sufficient) return null;
    const candidates = QUESTIONS.filter((q) => !answeredIds.has(q.id));
    if (!candidates.length) return null;
    return selectNextQuestion(candidates, observations, SKILL_IDS, graph, { hypotheses, params });
  }, [screen, mode, diagnosis.sufficient, answeredIds, observations, graph, hypotheses]);

  const demoDone = mode === 'demo' && profile && answers.length >= profile.answers.length;

  // Demo: play a scripted student's whole session so the result builds to full strength.
  useEffect(() => {
    if (screen !== 'quiz' || mode !== 'demo' || !profile) return;
    if (answers.length >= profile.answers.length) return;
    const t = setTimeout(() => setAnswers((a) => [...a, profile.answers[a.length]]), answers.length === 0 ? 400 : 1050);
    return () => clearTimeout(t);
  }, [screen, mode, profile, answers]);

  // Hold the just-answered card briefly (correct/incorrect feedback) before the next question.
  useEffect(() => {
    if (!answeredCard) return;
    const t = setTimeout(() => setAnsweredCard(null), 950);
    return () => clearTimeout(t);
  }, [answeredCard]);

  // Move to the result once the engine is confident (live) or the demo student finishes.
  useEffect(() => {
    if (screen !== 'quiz') return;
    const ready = mode === 'demo' ? demoDone : diagnosis.sufficient;
    if (ready) {
      const t = setTimeout(() => {
        setAnsweredCard(null);
        setScreen('diagnosis');
      }, mode === 'demo' ? 700 : 1000);
      return () => clearTimeout(t);
    }
  }, [screen, mode, demoDone, diagnosis.sufficient]);

  // Generate the lesson as soon as the student reaches the Learn step.
  useEffect(() => {
    if (screen === 'lesson' && !lesson && !loading) handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function reset(toScreen) {
    setAnswers([]);
    setAnsweredCard(null);
    setLesson(null);
    setLoading(false);
    setVerify({ answeredIndex: null, before: 0, after: 0 });
    setScreen(toScreen);
  }
  function startLive() { setMode('live'); setProfileId(null); reset('quiz'); }
  function startDemo(id = 'A') { setMode('demo'); setProfileId(id); reset('quiz'); }
  function goHome() { setMode('live'); setProfileId(null); reset('home'); }

  function answerQuiz(i) {
    if (!nextPick) return;
    setAnsweredCard({ question: nextPick.question, choiceIndex: i });
    setAnswers((a) => [...a, [nextPick.question.id, i]]);
  }

  async function handleGenerate() {
    const keystone = diagnosis.keystone;
    if (!keystone) return;
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
  function retest() {
    setLesson(null);
    setVerify({ answeredIndex: null, before: 0, after: 0 });
    setScreen('lesson');
  }

  // ---- derived view helpers ----
  const keystone = diagnosis.keystone;
  const blocked = keystone ? graph.descendants[keystone].map(skillName) : [];
  const confPct = Math.round((diagnosis.top?.prob ?? 0) * 100);
  const topReal = diagnosis.top && diagnosis.top.id !== HEALTHY;
  const leadName = topReal ? skillName(diagnosis.top.id) : null;

  const steps = ['Diagnose', 'Learn', 'Verify'];
  const stepIndex = screen === 'lesson' ? 1 : screen === 'verify' ? 2 : 0;

  // quiz progress reading
  let reading = 'Answer to begin';
  if (answers.length > 0) {
    if (!topReal) reading = 'Looking solid so far';
    else if (diagnosis.top.prob < 0.35) reading = 'Gathering signal';
    else reading = `Leaning toward ${leadName}`;
  }
  const progress = Math.min((diagnosis.top?.prob ?? 0) / 0.5, 1) * 100;

  return (
    <div className="shell">
      <header className="appbar">
        <button className="brand-btn" onClick={goHome} aria-label="Keystone home">
          <svg className="brand-glyph" viewBox="0 0 26 26" aria-hidden="true">
            <rect width="26" height="26" rx="7" fill="var(--accent)" />
            <path d="M6.5 7 h13 l-2.6 12 h-7.8 z" fill="var(--paper)" />
          </svg>
          <span className="wordmark"><span className="k">Key</span>stone</span>
        </button>
        {screen !== 'home' && (
          <div className="stepper">
            {steps.map((s, i) => (
              <span key={s} className={`step${i === stepIndex ? ' on' : ''}${i < stepIndex ? ' done' : ''}`}>{s}</span>
            ))}
          </div>
        )}
        {screen !== 'home' && <button className="sm ghost" onClick={goHome}>Exit</button>}
      </header>

      {/* ---------------- HOME ---------------- */}
      {screen === 'home' && (
        <main className="home">
          <p className="eyebrow">Calculus diagnostic tutor</p>
          <h1>Let's find what's actually<br />tripping you up.</h1>
          <p className="lead">
            Keep missing the same kind of problem? The mistake you see is usually a symptom. Answer a
            few questions and Keystone finds the one prerequisite underneath it, teaches that, and
            checks that it stuck.
          </p>
          <div className="home-cta">
            <button className="primary lg" onClick={startLive}>Start the diagnostic →</button>
            <button className="link" onClick={() => startDemo('A')}>▶ Watch a 30-second sample</button>
          </div>
          <p className="home-note">Adaptive · usually {MIN_QUESTIONS}–7 questions · no sign-up</p>
        </main>
      )}

      {/* ---------------- QUIZ ---------------- */}
      {screen === 'quiz' && (
        <main className="stage">
          <div className="quiz-head">
            <div className="quiz-line">
              <span className="q-index">{mode === 'demo' ? 'Sample run' : `Question ${answers.length + (answeredCard ? 0 : 1)}`}</span>
              <span className="reading">{reading}</span>
            </div>
            <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          </div>

          {mode === 'live' ? (
            answeredCard ? (
              <QuestionCard
                question={answeredCard.question}
                mode="review"
                chosenIndex={answeredCard.choiceIndex}
                caption={answeredCard.choiceIndex === answeredCard.question.ans ? 'Correct.' : 'Noted, that is useful signal.'}
              />
            ) : nextPick ? (
              <QuestionCard question={nextPick.question} mode="answer" onAnswer={answerQuiz} />
            ) : (
              <div className="card center">
                <p>You've answered everything and there is still no single clear gap.</p>
                <button className="primary" onClick={() => setScreen('diagnosis')}>See what we found →</button>
              </div>
            )
          ) : answers.length ? (
            <QuestionCard
              question={QUESTION_BY_ID[answers[answers.length - 1][0]]}
              mode="review"
              chosenIndex={answers[answers.length - 1][1]}
            />
          ) : (
            <div className="card center"><p className="muted">Starting sample…</p></div>
          )}

          {mode === 'live' && answers.length >= MIN_QUESTIONS && !diagnosis.sufficient && !answeredCard && (
            <button className="link center-block" onClick={() => setScreen('diagnosis')}>Stop and show my result →</button>
          )}
        </main>
      )}

      {/* ---------------- DIAGNOSIS ---------------- */}
      {screen === 'diagnosis' && (
        <main className="stage">
          {diagnosis.sufficient ? (
            <div className="card result">
              <p className="kicker">◆ We found it</p>
              <h2 className="keyname">Your keystone is <em>{skillName(keystone)}</em>.</h2>
              <p className="result-lead">
                Every problem you missed builds on {skillName(keystone).toLowerCase()}, and the skills
                above it tested clean. It is the earliest place the evidence points, so it is the one
                worth fixing first. {confPct}% confident after {answers.length} questions.
              </p>
              {blocked.length > 0 && (
                <div className="unblocks">
                  <div className="unblocks-label">Fixing this unblocks</div>
                  <div className="chips">
                    {blocked.map((b) => (<span className="chip-pill" key={b}>{b}</span>))}
                  </div>
                </div>
              )}
              <button className="gold lg" onClick={() => setScreen('lesson')}>Teach me this →</button>
            </div>
          ) : (
            <div className="card result">
              <p className="kicker">All clear</p>
              <h2 className="keyname">No single weak spot.</h2>
              <p className="result-lead">
                {topReal
                  ? `The evidence isn't conclusive enough to name one gap yet (leading guess: ${leadName}, ${confPct}%). Keystone would rather ask more than guess wrong.`
                  : 'Your prerequisites are holding up well across the board, nothing is clearly blocking you.'}
              </p>
              <div className="result-actions">
                <button className="primary" onClick={() => setScreen('quiz')}>Answer a few more →</button>
                <button className="ghost" onClick={startLive}>Start over</button>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ---------------- LESSON ---------------- */}
      {screen === 'lesson' && diagnosis.sufficient && (
        <main className="stage">
          <div className="card lesson">
            <div className="lesson-top">
              <h2 className="lesson-title">{skillName(keystone)}</h2>
              {lesson && (
                <span className={`source-badge ${lesson.source}`}>
                  {lesson.source === 'claude' ? 'written live by Claude' : 'targeted lesson'}
                </span>
              )}
            </div>
            {loading || !lesson ? (
              <p className="muted loading-line">Writing a lesson for your exact misconception…</p>
            ) : (
              <>
                <div className="lblock">
                  <div className="lbl">The misconception</div>
                  <p>{clean(lesson.misconception)}</p>
                </div>
                <div className="lblock">
                  <div className="lbl">A better way to see it</div>
                  <p>{clean(lesson.analogy)}</p>
                </div>
                <div className="lblock">
                  <div className="lbl">Worked example</div>
                  <p className="mono ex">{clean(lesson.workedExample)}</p>
                </div>
                <button className="primary lg" onClick={() => setScreen('verify')}>Check my understanding →</button>
              </>
            )}
          </div>
        </main>
      )}

      {/* ---------------- VERIFY ---------------- */}
      {screen === 'verify' && diagnosis.sufficient && lesson && (
        <main className="stage">
          <QuestionCard
            question={{ skill: keystone, prompt: lesson.verification.prompt, ans: lesson.verification.answerIndex, choices: lesson.verification.choices.map((t) => ({ t })) }}
            mode={verify.answeredIndex == null ? 'answer' : 'review'}
            chosenIndex={verify.answeredIndex}
            onAnswer={answerVerification}
            caption={verify.answeredIndex == null ? 'One check on the skill we just taught.' : null}
          />

          {verify.answeredIndex != null && (
            <div className="card verify-result">
              <h3>{verify.answeredIndex === lesson.verification.answerIndex ? 'That is it.' : 'Not quite, but that is what practice is for.'}</h3>
              <p className="muted">Estimated mastery of {skillName(keystone).toLowerCase()}, an updated estimate, not proof.</p>
              <div className="delta">
                <div className="row before"><span className="cap">before</span><span className="bar"><span style={{ width: `${Math.round(verify.before * 100)}%` }} /></span><span className="num">{Math.round(verify.before * 100)}%</span></div>
                <div className="row after"><span className="cap">after</span><span className="bar"><span style={{ width: `${Math.round(verify.after * 100)}%` }} /></span><span className="num">{Math.round(verify.after * 100)}%</span></div>
              </div>
              <div className="result-actions">
                <button className="primary" onClick={retest}>Another practice question</button>
                <button className="ghost" onClick={startLive}>New diagnostic</button>
              </div>
            </div>
          )}
        </main>
      )}

      <footer className="foot">
        <HowItWorks
          skillIds={SKILL_IDS}
          graph={graph}
          hypotheses={hypotheses}
          params={params}
          apiKey={apiKey}
          setApiKey={setApiKey}
          onDemo={startDemo}
        />
      </footer>
    </div>
  );
}
