// Layer 3: adaptive question selection by expected information gain.
//
// Current uncertainty = entropy of the hypothesis posterior. For each candidate question we simulate
// both outcomes (weighted by the posterior's own predicted P(correct)), recompute the expected
// posterior entropy, and score the question by how much it is expected to shrink uncertainty:
//   info gain = current entropy - expected posterior entropy.
// We pick the max, and report which two leading hypotheses that question best separates.

import { paramsFor } from './bkt.js';
import { diagnose, buildHypotheses } from './diagnosis.js';

// Marginal predicted P(correct) on `skill` under the current posterior.
function predictedCorrect(skill, posterior, params) {
  const p = paramsFor(params, skill);
  let acc = 0;
  for (const h of posterior) {
    const pc = h.impaired.has(skill) ? p.G : 1 - p.S;
    acc += h.prob * pc;
  }
  return acc;
}

export function scoreQuestions(candidates, observations, skillIds, graph, opts = {}) {
  const hyps = opts.hypotheses ?? buildHypotheses(skillIds, graph, opts);
  const shared = { ...opts, hypotheses: hyps };

  const current = diagnose(observations, skillIds, graph, shared);
  const currentH = current.entropy;

  const scored = candidates.map((q) => {
    const pC = predictedCorrect(q.skill, current.posterior, opts.params);
    const hCorrect = diagnose([...observations, { skill: q.skill, correct: true }], skillIds, graph, shared).entropy;
    const hWrong = diagnose([...observations, { skill: q.skill, correct: false }], skillIds, graph, shared).entropy;
    const expectedH = pC * hCorrect + (1 - pC) * hWrong;
    return { question: q, infoGain: currentH - expectedH, pCorrect: pC };
  });

  scored.sort((a, b) => b.infoGain - a.infoGain);
  return { scored, current, currentEntropy: currentH };
}

// The single best next question, plus the two leading hypotheses it separates.
export function selectNextQuestion(candidates, observations, skillIds, graph, opts = {}) {
  if (candidates.length === 0) return null;
  const { scored, current } = scoreQuestions(candidates, observations, skillIds, graph, opts);
  const best = scored[0];
  const skill = best.question.skill;

  // Among the leading hypotheses, find one that predicts this skill impaired and one that predicts
  // it capable -- those are the two the question is pulling apart.
  const ranked = current.posterior;
  const impairedSide = ranked.find((h) => h.impaired.has(skill));
  const capableSide = ranked.find((h) => !h.impaired.has(skill));

  return {
    question: best.question,
    infoGain: best.infoGain,
    pCorrect: best.pCorrect,
    separates: [impairedSide?.id, capableSide?.id].filter(Boolean),
    allScores: scored,
  };
}
