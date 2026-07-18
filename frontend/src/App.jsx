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
import studentPhoto from './assets/student-learning.jpg';

const SKILL_IDS = SKILLS.map((s) => s.id);
const MIN_QUESTIONS = 4; // matches the engine's insufficient-evidence gate
const LS_KEY = 'keystone.lastSession';
const clean = (t) => (t ? t.replaceAll(' — ', ', ') : t);

function loadLast() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  } catch {
    return null;
  }
}

// The engine's "why not the runner-up" evidence, phrased for the student.
function whyNotLine(whyNot) {
  if (!whyNot) return null;
  const o = whyNot.keyObservation;
  if (whyNot.runnerUp === HEALTHY) {
    return o.correct
      ? null
      : `Having no gap at all would mean solving the ${skillName(o.skill)} question you missed. That rules it out.`;
  }
  const did = o.correct ? 'solved' : 'missed';
  const pred = o.correct ? 'miss' : 'solve';
  return `You ${did} a ${skillName(o.skill)} question, and a ${skillName(whyNot.runnerUp)} gap predicts you would ${pred} it. That rules it out.`;
}

export default function App() {
  const graph = useMemo(() => buildGraph(SKILL_IDS, EDGES), []);
  const hypotheses = useMemo(() => buildHypotheses(SKILL_IDS, graph, {}), [graph]);

  const [screen, setScreen] = useState('home'); // home | quiz | diagnosis | lesson | verify | report
  const [mode, setMode] = useState('live'); // live | demo
  const [profileId, setProfileId] = useState(null);
  const [answers, setAnswers] = useState([]); // [[questionId, choiceIndex], ...]
  const [answeredCard, setAnsweredCard] = useState(null); // brief feedback beat
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [practice, setPractice] = useState(null); // { queue, i, attempts, masteryStart, masteryNow }
  const [apiKey, setApiKey] = useState('');
  const [last, setLast] = useState(loadLast);
  const [copied, setCopied] = useState(false);

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

  // When a lesson lands, build the practice queue (Claude's fresh questions, or the deterministic
  // bank). If a rare keystone has a thin queue, top it up with unused diagnostic questions.
  useEffect(() => {
    if (!lesson?.questions?.length || !diagnosis.keystone) return;
    let queue = lesson.questions;
    if (queue.length < 2) {
      const extras = QUESTIONS.filter((q) => q.skill === diagnosis.keystone && !answeredIds.has(q.id))
        .map((q) => ({ skill: q.skill, prompt: q.prompt, ans: q.ans, choices: q.choices }));
      queue = [...queue, ...extras];
    }
    const m = mastery[diagnosis.keystone] ?? 0.3;
    setPractice({ queue, i: 0, attempts: [], masteryStart: m, masteryNow: m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson]);

  // Persist a session summary whenever the report is (re)shown.
  useEffect(() => {
    if (screen !== 'report' || !diagnosis.sufficient || !practice) return;
    const summary = {
      at: new Date().toISOString().slice(0, 10),
      keystone: diagnosis.keystone,
      keystoneName: skillName(diagnosis.keystone),
      confidence: Math.round(diagnosis.top.prob * 100),
      nDiagnostic: answers.length,
      nMissed: observations.filter((o) => !o.correct).length,
      practiced: practice.attempts.length,
      practicedCorrect: practice.attempts.filter((a) => a.correct).length,
      masteryStart: Math.round(practice.masteryStart * 100),
      masteryNow: Math.round(practice.masteryNow * 100),
      unblocks: graph.descendants[diagnosis.keystone].map(skillName),
    };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(summary));
    } catch { /* private mode etc. */ }
    setLast(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, practice]);

  function resetSession(toScreen) {
    setAnswers([]);
    setAnsweredCard(null);
    setLesson(null);
    setLoading(false);
    setPractice(null);
    setCopied(false);
    setScreen(toScreen);
  }
  function startLive() { setMode('live'); setProfileId(null); resetSession('quiz'); }
  function startDemo(id = 'A') { setMode('demo'); setProfileId(id); resetSession('quiz'); }
  function goHome() { setMode('live'); setProfileId(null); resetSession('home'); }
  function clearLast() {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    setLast(null);
  }

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

  function answerPractice(i) {
    if (!practice) return;
    const cur = practice.queue[practice.i];
    if (!cur || practice.attempts[practice.i]) return;
    const correct = i === cur.ans;
    const after = updateBKT(practice.masteryNow, correct, paramsFor(params, diagnosis.keystone));
    setPractice((p) => ({ ...p, attempts: [...p.attempts, { choice: i, correct }], masteryNow: after }));
  }
  function nextPractice() {
    setPractice((p) => (p && p.i + 1 < p.queue.length ? { ...p, i: p.i + 1 } : p));
    setScreen('verify');
  }

  async function copySummary() {
    if (!last) return;
    const text =
      `Keystone session (${last.at}): diagnosed keystone skill = ${last.keystoneName} ` +
      `(${last.confidence}% confidence after ${last.nDiagnostic} questions, ${last.nMissed} missed). ` +
      `Practice: ${last.practicedCorrect}/${last.practiced} correct. ` +
      `Estimated mastery ${last.masteryStart}% -> ${last.masteryNow}%. ` +
      `Recommend reteaching ${last.keystoneName} before ${last.unblocks.slice(0, 3).join(', ')}.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  // ---- derived view helpers ----
  const keystone = diagnosis.keystone;
  const blocked = keystone ? graph.descendants[keystone].map(skillName) : [];
  const confPct = Math.round((diagnosis.top?.prob ?? 0) * 100);
  const topReal = diagnosis.top && diagnosis.top.id !== HEALTHY;
  const leadName = topReal ? skillName(diagnosis.top.id) : null;

  const errorTagLines = useMemo(() => {
    const seen = new Set();
    return observations
      .filter((o) => !o.correct && o.errorTag)
      .filter((o) => {
        const k = `${o.skill}|${o.errorTag}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 3);
  }, [observations]);

  const steps = ['Diagnose', 'Learn', 'Verify'];
  const stepIndex = screen === 'lesson' ? 1 : screen === 'verify' || screen === 'report' ? 2 : 0;

  let reading = 'Answer to begin';
  if (answers.length > 0) {
    if (!topReal) reading = 'Looking solid so far';
    else if (diagnosis.top.prob < 0.35) reading = 'Gathering signal';
    else reading = `Leaning toward ${leadName}`;
  }
  const progress = Math.min((diagnosis.top?.prob ?? 0) / 0.5, 1) * 100;

  const curPractice = practice?.queue[practice.i] ?? null;
  const curAttempt = practice?.attempts[practice.i] ?? null;
  const morePractice = practice ? practice.i + 1 < practice.queue.length : false;
  const why = diagnosis.sufficient ? whyNotLine(diagnosis.whyNot) : null;

  return (
    <div className={`shell shell-${screen}`}>
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
          <div className="home-layout">
          <section className="home-copy">
          <p className="eyebrow">Calculus diagnostic tutor</p>
          <h1>Fix the gap beneath the mistake.</h1>
          <p className="lead">
            Keep missing the same kind of problem? The mistake you see is usually a symptom. Answer a
            few questions and Keystone finds the one prerequisite underneath it, teaches that, and
            checks that it stuck.
          </p>
          <div className="home-cta">
            <button className="primary lg" onClick={startLive}>Start the diagnostic →</button>
            <button className="link" onClick={() => startDemo('A')}>▶ Watch a 30-second sample</button>
          </div>
          {last && (
            <div className="resume">
              <span>
                <b>Last session</b> · {last.keystoneName} · mastery {last.masteryStart}% → {last.masteryNow}%
              </span>
              <span className="resume-actions">
                <button className="sm" onClick={startLive}>Re-test →</button>
                <button className="sm ghost" onClick={clearLast} aria-label="Clear saved session">✕</button>
              </span>
            </div>
          )}
          </section>
          <figure className="hero-photo">
            <img src={studentPhoto} alt="University student studying with a laptop and notebook" />
            <figcaption>
              <span className="photo-mark">K</span>
              <span><small>The Keystone principle</small><b>A wrong answer is evidence, not a verdict.</b></span>
            </figcaption>
          </figure>
          </div>
          <div className="proof-strip">
            <div><b>Adaptive</b><span>every question is picked to separate the likely causes fastest</span></div>
            <div><b>Evidence-backed</b><span>shows the errors it saw, and why the runner-up was ruled out</span></div>
            <div><b>Verified</b><span>teaches the one gap, then re-measures mastery with fresh practice</span></div>
          </div>
          <p className="home-note">Usually {MIN_QUESTIONS}-7 questions · answer with keys A-D · no sign-up</p>
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

              {errorTagLines.length > 0 && (
                <div className="saw">
                  <div className="saw-h">What we saw in your answers</div>
                  {errorTagLines.map((o) => (
                    <div className="saw-row" key={`${o.skill}|${o.errorTag}`}>
                      <b>{skillName(o.skill)}:</b>&nbsp;you {clean(o.errorTag)}.
                    </div>
                  ))}
                </div>
              )}

              {why && (
                <p className="whynot-line">
                  <b>Why not {diagnosis.whyNot.runnerUp === HEALTHY ? 'no gap at all' : skillName(diagnosis.whyNot.runnerUp)}?</b>{' '}
                  {why}
                </p>
              )}

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
                {errorTagLines.length > 0 && (
                  <p className="observed">
                    On your diagnostic, you {errorTagLines.map((o) => clean(o.errorTag)).join(', and you ')}.
                  </p>
                )}
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
                {lesson.source === 'fallback' && (
                  <p className="caption">Tip: add an Anthropic API key in the footer and Claude writes this lesson and its practice questions live, from your exact errors.</p>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {/* ---------------- VERIFY (practice loop) ---------------- */}
      {screen === 'verify' && diagnosis.sufficient && practice && curPractice && (
        <main className="stage">
          <QuestionCard
            question={curPractice}
            mode={curAttempt ? 'review' : 'answer'}
            chosenIndex={curAttempt?.choice ?? null}
            onAnswer={answerPractice}
            metaLabel="practice"
            count={`question ${practice.i + 1} of ${practice.queue.length}`}
            caption={curAttempt ? null : 'A fresh question on the skill we just covered.'}
          />

          {curAttempt && (
            <div className="card verify-result">
              <h3>{curAttempt.correct ? 'That is it.' : 'Not quite. Look back at the worked example.'}</h3>
              <div className="dots" aria-label="practice history">
                {practice.queue.map((_, i) => {
                  const a = practice.attempts[i];
                  return <span key={i} className={`dot ${a ? (a.correct ? 'ok' : 'no') : 'pending'}`} />;
                })}
              </div>
              <p className="muted">Estimated mastery of {skillName(keystone).toLowerCase()}, an updated estimate, not proof.</p>
              <div className="delta">
                <div className="row before"><span className="cap">before</span><span className="bar"><span style={{ width: `${Math.round(practice.masteryStart * 100)}%` }} /></span><span className="num">{Math.round(practice.masteryStart * 100)}%</span></div>
                <div className="row after"><span className="cap">now</span><span className="bar"><span style={{ width: `${Math.round(practice.masteryNow * 100)}%` }} /></span><span className="num">{Math.round(practice.masteryNow * 100)}%</span></div>
              </div>
              <div className="result-actions">
                {morePractice && <button className="primary" onClick={nextPractice}>Next question →</button>}
                <button className={morePractice ? 'ghost' : 'primary'} onClick={() => setScreen('report')}>Finish session →</button>
                <button className="ghost" onClick={() => setScreen('lesson')}>Back to the lesson</button>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ---------------- REPORT ---------------- */}
      {screen === 'report' && diagnosis.sufficient && practice && (
        <main className="stage">
          <div className="card result">
            <p className="kicker">Session report</p>
            <h2 className="keyname">
              {practice.masteryNow > practice.masteryStart ? (
                <>You moved <em>{skillName(keystone)}</em> from {Math.round(practice.masteryStart * 100)}% to {Math.round(practice.masteryNow * 100)}%.</>
              ) : (
                <><em>{skillName(keystone)}</em> is still shaky, and now you know it.</>
              )}
            </h2>

            <div className="report-grid">
              <div className="stat">
                <div className="n accent">{skillName(keystone)}</div>
                <div className="l">keystone found at {confPct}% confidence</div>
              </div>
              <div className="stat">
                <div className="n">{answers.length}</div>
                <div className="l">diagnostic questions ({observations.filter((o) => !o.correct).length} missed)</div>
              </div>
              <div className="stat">
                <div className="n">{practice.attempts.filter((a) => a.correct).length}/{practice.attempts.length}</div>
                <div className="l">practice questions correct</div>
              </div>
              <div className="stat">
                <div className="n">{blocked.length}</div>
                <div className="l">downstream skills this unblocks</div>
              </div>
            </div>

            {blocked.length > 0 && (
              <div className="unblocks">
                <div className="unblocks-label">Now worth revisiting</div>
                <div className="chips">
                  {blocked.map((b) => (<span className="chip-pill" key={b}>{b}</span>))}
                </div>
              </div>
            )}

            <p className="honesty">
              Mastery numbers are the model's updated estimates from your answers, not proof of learning.
              Re-test tomorrow; the estimate stays saved on this device.
            </p>

            <div className="result-actions">
              {morePractice && <button className="gold" onClick={nextPractice}>Keep practicing →</button>}
              <button className="primary" onClick={startLive}>New diagnostic</button>
              <button className="ghost" onClick={copySummary}>{copied ? 'Copied ✓' : 'Copy summary for your teacher'}</button>
            </div>
          </div>
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
