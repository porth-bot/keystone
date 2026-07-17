// Layer 1: Bayesian Knowledge Tracing (standard 4-parameter model, one instance per skill).
//   L0  prior P(known before any evidence)
//   T   P(transition unknown -> known) after an attempt  (learning)
//   G   P(correct | not known)                            (guess)
//   S   P(incorrect | known)                              (slip)
//
// This layer answers "what does the student know?" It colors the graph nodes and, in the
// verification loop, produces the before/after mastery delta on the keystone skill.
// The engine is pure: callers pass the per-skill params object, so the same code runs in the
// browser and in the headless Node tests.

export const DEFAULT_BKT = { L0: 0.3, T: 0.12, G: 0.2, S: 0.1 };

export function paramsFor(params, skill) {
  return { ...DEFAULT_BKT, ...(params?.[skill] ?? {}) };
}

// Probability the next answer is correct given current mastery L.
export function pCorrect(L, p) {
  return L * (1 - p.S) + (1 - L) * p.G;
}

// Posterior mastery after observing one answer, then applying the learning transition.
// Returns the new P(known). `learn` can be disabled to get the pure evidence posterior
// (useful when we only want "given the answers, how likely is mastery" without the bump).
export function updateBKT(L, correct, p, { learn = true } = {}) {
  let posterior;
  if (correct) {
    const num = L * (1 - p.S);
    posterior = num / (num + (1 - L) * p.G);
  } else {
    const num = L * p.S;
    posterior = num / (num + (1 - L) * (1 - p.G));
  }
  return learn ? posterior + (1 - posterior) * p.T : posterior;
}

// Initial mastery vector (skill id -> L0) for a fresh student.
export function initMastery(skillIds, params) {
  return Object.fromEntries(skillIds.map((s) => [s, paramsFor(params, s).L0]));
}

// Fold a sequence of observations into a mastery vector. Observations that reference a
// skill are applied to that skill's BKT chain; other skills keep their prior.
export function runBKT(observations, skillIds, params) {
  const mastery = initMastery(skillIds, params);
  for (const obs of observations) {
    if (obs.skill in mastery) {
      mastery[obs.skill] = updateBKT(mastery[obs.skill], obs.correct, paramsFor(params, obs.skill));
    }
  }
  return mastery;
}
