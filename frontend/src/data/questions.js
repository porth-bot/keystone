// Question bank. Every wrong choice carries a misconception `tag` -- these are the "observed errors"
// fed to Claude when it writes the micro-lesson. Distractors are diagnostic: each maps to one real,
// distinct mistake, never a random wrong number. Composition / chain / power appear twice because
// they carry the "why not the chain rule" story.
//
// Shape: { id, skill, prompt, ans (index of correct choice), choices: [{ t, tag? }] }
// The correct choice has no tag.

export const QUESTIONS = [
  {
    id: 'q_exp_1',
    skill: 'exponent_rules',
    prompt: 'Simplify:  x^5 · x^3',
    ans: 0,
    choices: [
      { t: 'x^8' },
      { t: 'x^15', tag: 'multiplied the exponents instead of adding' },
      { t: 'x^2', tag: 'subtracted the exponents' },
      { t: '2x^8', tag: 'doubled the base' },
    ],
  },
  {
    id: 'q_exp_2',
    skill: 'exponent_rules',
    prompt: 'Simplify:  (x^3)^2',
    ans: 0,
    choices: [
      { t: 'x^6' },
      { t: 'x^5', tag: 'added the exponents instead of multiplying' },
      { t: 'x^9', tag: 'multiplied the exponent by 3 instead of 2' },
      { t: 'x^1', tag: 'subtracted the exponents' },
    ],
  },
  {
    id: 'q_fac_1',
    skill: 'factoring',
    prompt: 'Factor completely:  x^2 − 5x + 6',
    ans: 0,
    choices: [
      { t: '(x − 2)(x − 3)' },
      { t: '(x + 2)(x + 3)', tag: 'sign error on the factors' },
      { t: '(x − 1)(x − 6)', tag: 'matched the constant, ignored the middle term' },
      { t: '(x − 2)(x + 3)', tag: 'mixed signs on the factors' },
    ],
  },
  {
    id: 'q_frac_1',
    skill: 'fractions',
    prompt: 'Simplify:  1/x + 1/(x + 1)',
    ans: 0,
    choices: [
      { t: '(2x + 1) / (x(x + 1))' },
      { t: '2 / (2x + 1)', tag: 'added the denominators' },
      { t: '1 / (x(x + 1))', tag: 'dropped the numerators' },
      { t: '(2x + 1) / (x + 1)', tag: 'dropped a denominator factor' },
    ],
  },
  {
    id: 'q_fnot_1',
    skill: 'function_notation',
    prompt: 'If f(x) = x^2 − 3, find f(−2).',
    ans: 0,
    choices: [
      { t: '1' },
      { t: '−7', tag: 'treated −2^2 as −4' },
      { t: '−1', tag: 'sign error while squaring' },
      { t: '7', tag: 'added 3 instead of subtracting' },
    ],
  },
  {
    id: 'q_comp_1',
    skill: 'function_composition',
    prompt: 'If f(x) = x + 1 and g(x) = x^2, find f(g(x)).',
    ans: 0,
    choices: [
      { t: 'x^2 + 1' },
      { t: '(x + 1)^2', tag: 'composed in the wrong order (did g(f(x)))' },
      { t: 'x^2 + x', tag: 'multiplied f and g instead of composing' },
      { t: 'x + 1', tag: 'ignored the inner function g' },
    ],
  },
  {
    id: 'q_comp_2',
    skill: 'function_composition',
    prompt: 'If f(x) = √x and g(x) = x − 4, find f(g(x)).',
    ans: 0,
    choices: [
      { t: '√(x − 4)' },
      { t: '√x − 4', tag: 'applied the outer function then subtracted (wrong order)' },
      { t: '√x − 2', tag: 'distributed the root over subtraction' },
      { t: 'x − 4', tag: 'forgot to apply the outer function' },
    ],
  },
  {
    id: 'q_inv_1',
    skill: 'inverse_functions',
    prompt: 'Find the inverse of f(x) = 2x + 6.',
    ans: 0,
    choices: [
      { t: '(x − 6) / 2' },
      { t: '1 / (2x + 6)', tag: 'confused inverse with reciprocal' },
      { t: '2x − 6', tag: 'negated the constant only' },
      { t: '(x + 6) / 2', tag: 'sign error solving for x' },
    ],
  },
  {
    id: 'q_trig_1',
    skill: 'trig_functions',
    prompt: 'What is the exact value of sin(π/6)?',
    ans: 0,
    choices: [
      { t: '1/2' },
      { t: '√3/2', tag: 'confused with cos(π/6)' },
      { t: '√2/2', tag: 'confused with sin(π/4)' },
      { t: '1', tag: 'confused with sin(π/2)' },
    ],
  },
  {
    id: 'q_explog_1',
    skill: 'exponential_log',
    prompt: 'Simplify:  log(a) + log(b)',
    ans: 0,
    choices: [
      { t: 'log(ab)' },
      { t: 'log(a + b)', tag: 'turned a sum of logs into a log of a sum' },
      { t: 'log(a) · log(b)', tag: 'multiplied the logs' },
      { t: 'log(a / b)', tag: 'used the quotient rule instead of the product rule' },
    ],
  },
  {
    id: 'q_lim_1',
    skill: 'limits_intuition',
    prompt: 'Evaluate:  lim(x → 2) x^2',
    ans: 0,
    choices: [
      { t: '4' },
      { t: 'does not exist', tag: 'assumed a discontinuity' },
      { t: '2', tag: 'substituted without squaring' },
      { t: '0', tag: 'assumed the limit is 0' },
    ],
  },
  {
    id: 'q_limlaw_1',
    skill: 'limit_laws',
    prompt: 'Evaluate:  lim(x → 3) (x^2 − 9)/(x − 3)',
    ans: 0,
    choices: [
      { t: '6' },
      { t: 'undefined (0/0)', tag: 'stopped at the indeterminate form' },
      { t: '0', tag: 'cancelled the whole expression to 0' },
      { t: '3', tag: 'substituted the root of the numerator' },
    ],
  },
  {
    id: 'q_cont_1',
    skill: 'continuity',
    prompt: 'A function has a hole at x = 1. Is it continuous at x = 1?',
    ans: 0,
    choices: [
      { t: 'No, it is not defined there' },
      { t: 'Yes, the limit exists', tag: 'confused the limit existing with continuity' },
      { t: 'Yes, it can be made continuous', tag: 'confused removable with continuous' },
      { t: 'Only from the left', tag: 'confused one-sided limits with continuity' },
    ],
  },
  {
    id: 'q_defder_1',
    skill: 'derivative_definition',
    prompt: "f'(a) is defined as the limit (as h → 0) of which expression?",
    ans: 0,
    choices: [
      { t: '(f(a + h) − f(a)) / h' },
      { t: '(f(a + h) + f(a)) / h', tag: 'sign error in the difference quotient' },
      { t: '(f(a + h) − f(a)) · h', tag: 'multiplied by h instead of dividing' },
      { t: 'f(a + h) − f(a)', tag: 'omitted dividing by h' },
    ],
  },
  {
    id: 'q_pow_1',
    skill: 'power_rule',
    prompt: 'Differentiate:  f(x) = x^5',
    ans: 0,
    choices: [
      { t: '5x^4' },
      { t: 'x^4', tag: 'dropped the coefficient from the exponent' },
      { t: '5x^5', tag: 'did not reduce the exponent' },
      { t: '5x^6', tag: 'increased the exponent instead of reducing' },
    ],
  },
  {
    id: 'q_pow_2',
    skill: 'power_rule',
    prompt: 'Differentiate:  f(x) = 3x^2',
    ans: 0,
    choices: [
      { t: '6x' },
      { t: '3x', tag: 'forgot to bring the exponent down' },
      { t: '6x^2', tag: 'did not reduce the exponent' },
      { t: '5x', tag: 'added the exponent to the coefficient' },
    ],
  },
  {
    id: 'q_pq_1',
    skill: 'product_quotient_rule',
    prompt: 'Differentiate:  f(x) = x^2 · sin(x)',
    ans: 0,
    choices: [
      { t: '2x·sin(x) + x^2·cos(x)' },
      { t: '2x·cos(x)', tag: 'multiplied the two derivatives' },
      { t: '2x·sin(x)', tag: 'differentiated only the first factor' },
      { t: 'x^2·cos(x) − 2x·sin(x)', tag: 'used the quotient-rule sign' },
    ],
  },
  {
    id: 'q_chain_1',
    skill: 'chain_rule',
    prompt: 'Differentiate:  f(x) = (3x + 1)^4',
    ans: 0,
    choices: [
      { t: '12(3x + 1)^3' },
      { t: '4(3x + 1)^3', tag: 'omitted the inner derivative' },
      { t: '12(3x + 1)^4', tag: 'forgot to reduce the exponent' },
      { t: '4(3x + 1)^3 · 3x', tag: 'used the inner function instead of its derivative' },
    ],
  },
  {
    id: 'q_chain_2',
    skill: 'chain_rule',
    prompt: 'Differentiate:  f(x) = sin(x^2)',
    ans: 0,
    choices: [
      { t: '2x·cos(x^2)' },
      { t: 'cos(x^2)', tag: 'omitted the inner derivative' },
      { t: 'cos(2x)', tag: 'differentiated inside the argument only' },
      { t: '2x·cos(2x)', tag: 'differentiated the inner argument twice' },
    ],
  },
  {
    id: 'q_impl_1',
    skill: 'implicit_differentiation',
    prompt: 'Given x^2 + y^2 = 25, find dy/dx.',
    ans: 0,
    choices: [
      { t: '−x / y' },
      { t: 'x / y', tag: 'sign error moving terms across' },
      { t: '−x', tag: 'forgot the dy/dx factor on the y term' },
      { t: '2x + 2y', tag: 'did not differentiate implicitly' },
    ],
  },
  {
    id: 'q_rr_1',
    skill: 'related_rates',
    prompt: 'For V = (4/3)πr^3 with r changing in time, to relate dV/dt and dr/dt you must:',
    ans: 0,
    choices: [
      { t: 'differentiate both sides with respect to t (chain rule)' },
      { t: 'solve for r first, then substitute', tag: 'skipped differentiating with respect to time' },
      { t: 'set dV/dt = dr/dt', tag: 'assumed the rates are equal' },
      { t: 'differentiate with respect to r only', tag: 'differentiated with the wrong variable' },
    ],
  },
  {
    id: 'q_opt_1',
    skill: 'optimization',
    prompt: 'To find the minimum of f(x) = x^2 − 4x + 1, you first:',
    ans: 0,
    choices: [
      { t: "set f'(x) = 0 and solve" },
      { t: 'set f(x) = 0 and solve', tag: 'confused roots with critical points' },
      { t: 'substitute x = 0', tag: 'assumed the minimum is at the origin' },
      { t: "set f''(x) = 0", tag: 'confused the concavity test with finding critical points' },
    ],
  },
  {
    id: 'q_anti_1',
    skill: 'antiderivatives',
    prompt: 'Find the antiderivative of f(x) = x^2.',
    ans: 0,
    choices: [
      { t: 'x^3/3 + C' },
      { t: '2x + C', tag: 'differentiated instead of integrating' },
      { t: 'x^3 + C', tag: 'forgot to divide by the new exponent' },
      { t: 'x^3/3', tag: 'omitted the constant of integration' },
    ],
  },
  {
    id: 'q_usub_1',
    skill: 'u_substitution',
    prompt: 'For ∫ 2x·(x^2 + 1)^5 dx, the best substitution is:',
    ans: 0,
    choices: [
      { t: 'u = x^2 + 1' },
      { t: 'u = 2x', tag: 'chose a factor that is not the inner function' },
      { t: 'u = (x^2 + 1)^5', tag: 'substituted the whole power' },
      { t: 'no substitution needed', tag: 'missed the composition' },
    ],
  },
];

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// Turn a (questionId, chosenIndex) pair into an engine observation enriched with the misconception tag.
export function toObservation(questionId, choiceIndex) {
  const q = QUESTION_BY_ID[questionId];
  const chosen = q.choices[choiceIndex];
  return {
    questionId,
    skill: q.skill,
    correct: choiceIndex === q.ans,
    choiceIndex,
    errorTag: choiceIndex === q.ans ? null : chosen?.tag ?? null,
  };
}
