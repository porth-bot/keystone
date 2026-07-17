// In-browser model validation on a SYNTHETIC cohort (clearly labeled as such in the UI).
//
// We generate students from the true BKT generative process (hidden known/unknown state per skill,
// randomized per student), then measure held-out next-answer prediction using the population
// parameters -- so the model is NOT an oracle for any individual student. We compare three models:
//   * BKT            tracks per-skill mastery and predicts P(correct)
//   * majority       always predicts the global base rate
//   * previous-answer predicts the student's most recent result on that skill
// Metrics: ROC AUC, accuracy, Brier score. Seeded so the reported numbers are stable across loads.
//
// This is a calibration / self-consistency check on synthetic students. The honest "real data"
// path (fit + held-out evaluation on a public dataset) lives in evaluation/.

import { paramsFor, pCorrect, updateBKT } from './bkt.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bernoulli = (rand, p) => (rand() < p ? 1 : 0);

// One student: a shuffled sequence of attempts over a few skills, plus a held-out final attempt on
// a skill the student has already seen. Correctness comes from the true hidden BKT state.
function simulateStudent(rand, skillIds, params) {
  const nSkills = 3 + Math.floor(rand() * 3); // 3..5 skills
  const chosen = [];
  const pool = [...skillIds];
  for (let i = 0; i < nSkills; i++) {
    chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }

  const known = {}; // hidden state
  const seq = [];
  for (const s of chosen) {
    const p = paramsFor(params, s);
    if (!(s in known)) known[s] = bernoulli(rand, p.L0);
    const nAttempts = 2 + Math.floor(rand() * 3); // 2..4
    for (let i = 0; i < nAttempts; i++) {
      const correct = bernoulli(rand, known[s] ? 1 - p.S : p.G);
      seq.push({ skill: s, correct });
      if (!known[s] && rand() < p.T) known[s] = 1; // learning transition
    }
  }
  // Shuffle attempts, then append a held-out attempt on an already-seen skill.
  for (let i = seq.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [seq[i], seq[j]] = [seq[j], seq[i]];
  }
  const heldSkill = chosen[Math.floor(rand() * chosen.length)];
  const hp = paramsFor(params, heldSkill);
  const heldout = { skill: heldSkill, correct: bernoulli(rand, known[heldSkill] ? 1 - hp.S : hp.G) };
  return { history: seq, heldout };
}

function rocAuc(scores, labels) {
  const pos = labels.filter((l) => l === 1).length;
  const neg = labels.length - pos;
  if (pos === 0 || neg === 0) return NaN;
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = new Array(scores.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avg = (i + j) / 2 + 1; // average rank (1-based)
    for (let k = i; k <= j; k++) ranks[idx[k]] = avg;
    i = j + 1;
  }
  let sumPos = 0;
  for (let k = 0; k < labels.length; k++) if (labels[k] === 1) sumPos += ranks[k];
  return (sumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

function metrics(scores, labels) {
  const n = labels.length;
  const acc = labels.reduce((a, l, i) => a + ((scores[i] >= 0.5 ? 1 : 0) === l ? 1 : 0), 0) / n;
  const brier = labels.reduce((a, l, i) => a + (scores[i] - l) ** 2, 0) / n;
  return { auc: rocAuc(scores, labels), accuracy: acc, brier };
}

export function runValidation(skillIds, params, { nStudents = 1200, seed = 20260730 } = {}) {
  const rand = mulberry32(seed);
  const students = Array.from({ length: nStudents }, () => simulateStudent(rand, skillIds, params));

  // global base rate over all training answers -> the "majority" predictor
  let totCorrect = 0;
  let totCount = 0;
  for (const st of students) for (const a of st.history) (totCorrect += a.correct), totCount++;
  const baseRate = totCorrect / totCount;

  const bkt = { scores: [], labels: [] };
  const maj = { scores: [], labels: [] };
  const prev = { scores: [], labels: [] };

  for (const st of students) {
    const target = st.heldout;
    // BKT: fold the student's history for the target skill, predict P(correct)
    let L = paramsFor(params, target.skill).L0;
    let lastOnSkill = null;
    for (const a of st.history) {
      if (a.skill === target.skill) {
        lastOnSkill = a.correct;
        L = updateBKT(L, a.correct, paramsFor(params, a.skill));
      }
    }
    bkt.scores.push(pCorrect(L, paramsFor(params, target.skill)));
    bkt.labels.push(target.correct);

    maj.scores.push(baseRate);
    maj.labels.push(target.correct);

    prev.scores.push(lastOnSkill == null ? baseRate : lastOnSkill ? 0.9 : 0.1);
    prev.labels.push(target.correct);
  }

  return {
    nStudents,
    nHeldout: students.length,
    baseRate,
    models: {
      bkt: { name: 'BKT (this model)', ...metrics(bkt.scores, bkt.labels) },
      previousAnswer: { name: 'Baseline: previous answer', ...metrics(prev.scores, prev.labels) },
      majority: { name: 'Baseline: majority / base rate', ...metrics(maj.scores, maj.labels) },
    },
  };
}
