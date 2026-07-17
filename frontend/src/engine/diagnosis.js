// Layer 2: Bayesian root-cause diagnosis. THE core idea.
//
// One hypothesis per skill: h_s = "skill s is the single true gap."
//   Under h_s the student is IMPAIRED on s and every downstream skill, and CAPABLE elsewhere.
//   impaired -> P(correct) = guess (~0.2);   capable -> P(correct) = 1 - slip (~0.9).
// Plus one h_healthy = "no gap" (capable everywhere), given a mild prior head start so a gap has
// to be *earned* by evidence rather than assumed.
//
// Posterior over hypotheses is prior x product of per-observation likelihoods, computed in log
// space and softmaxed. The "why not the runner-up" line falls out of the math: it is simply the
// observation with the largest log-likelihood ratio between the winner and the runner-up. Nothing
// about the reveal is hardcoded to a particular skill.

import { paramsFor } from './bkt.js';
import { impairedSet } from './graph.js';

export const HEALTHY = 'healthy';

const DEFAULTS = {
  healthyPriorWeight: 2.5, // healthy starts as the single most likely hypothesis (mild bias)
  minObservations: 4,
  minTopProb: 0.5,
};

// log P(one observation | a hypothesis described by its impaired set)
function logLikObs(obs, impaired, params) {
  const p = paramsFor(params, obs.skill);
  const pCorrect = impaired.has(obs.skill) ? p.G : 1 - p.S;
  const pObs = obs.correct ? pCorrect : 1 - pCorrect;
  return Math.log(Math.max(pObs, 1e-9));
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function entropy(probs) {
  return -probs.reduce((h, p) => (p > 0 ? h + p * Math.log2(p) : h), 0);
}

// Build the list of hypotheses once (skill hypotheses + healthy), each with its impaired set and prior.
export function buildHypotheses(skillIds, graph, opts = {}) {
  const { healthyPriorWeight } = { ...DEFAULTS, ...opts };
  const hyps = skillIds.map((s) => ({
    id: s,
    isHealthy: false,
    impaired: impairedSet(graph, s),
    priorWeight: 1,
  }));
  hyps.push({ id: HEALTHY, isHealthy: true, impaired: new Set(), priorWeight: healthyPriorWeight });
  const totalWeight = hyps.reduce((a, h) => a + h.priorWeight, 0);
  for (const h of hyps) h.logPrior = Math.log(h.priorWeight / totalWeight);
  return hyps;
}

// Full diagnosis given a set of observations. Returns the ranked posterior, the gate decision,
// the impaired subgraph for the winner, and the "why not the runner-up" explanation.
export function diagnose(observations, skillIds, graph, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const hyps = opts.hypotheses ?? buildHypotheses(skillIds, graph, cfg);
  const params = opts.params;

  const logPost = hyps.map(
    (h) => h.logPrior + observations.reduce((acc, o) => acc + logLikObs(o, h.impaired, params), 0),
  );
  const probs = softmax(logPost);

  const ranked = hyps
    .map((h, i) => ({ id: h.id, isHealthy: h.isHealthy, prob: probs[i], impaired: h.impaired }))
    .sort((a, b) => b.prob - a.prob);

  const top = ranked[0];
  const runnerUp = ranked[1];
  const H = entropy(probs);

  const realTop = !top.isHealthy;
  const sufficient =
    observations.length >= cfg.minObservations && top.prob >= cfg.minTopProb && realTop;

  let reason;
  if (sufficient) {
    reason = `Confident: ${Math.round(top.prob * 100)}% on a single keystone after ${observations.length} observations.`;
  } else if (observations.length < cfg.minObservations) {
    reason = `More evidence needed: only ${observations.length} of ${cfg.minObservations} required observations.`;
  } else if (!realTop) {
    reason = `More evidence needed: the "no clear gap" hypothesis still leads. Nothing yet earns a keystone.`;
  } else {
    reason = `More evidence needed: leading cause is only ${Math.round(top.prob * 100)}% (need ${Math.round(cfg.minTopProb * 100)}%).`;
  }

  return {
    posterior: ranked,
    top,
    runnerUp,
    entropy: H,
    sufficient,
    reason,
    keystone: sufficient ? top.id : null,
    impaired: sufficient ? [...top.impaired] : [],
    whyNot: sufficient ? explainWhyNot(observations, top, runnerUp, params) : null,
  };
}

// "Why not the runner-up": pick the observation whose log-likelihood ratio most favors the winner
// over the runner-up, and template a sentence about the runner-up's failed prediction.
export function explainWhyNot(observations, top, runnerUp, params) {
  if (!runnerUp || observations.length === 0) return null;

  let best = null;
  let bestLLR = -Infinity;
  for (const o of observations) {
    const llr = logLikObs(o, top.impaired, params) - logLikObs(o, runnerUp.impaired, params);
    if (llr > bestLLR) {
      bestLLR = llr;
      best = o;
    }
  }
  if (!best || bestLLR <= 0) return null;

  const runnerName = runnerUp.isHealthy ? 'no-gap' : runnerUp.id;
  const runnerPredictsImpaired = runnerUp.impaired.has(best.skill);
  // The runner-up's prediction that the evidence contradicts:
  const predicted = runnerPredictsImpaired ? 'miss' : 'solve';
  const actual = best.correct ? 'solved' : 'missed';

  return {
    runnerUp: runnerUp.id,
    keyObservation: best,
    logLikRatio: bestLLR,
    sentence:
      `The student ${actual} the "${best.skill}" question. ` +
      `A ${runnerName} gap predicts they would ${predicted} it, so that hypothesis is ruled out.`,
  };
}
