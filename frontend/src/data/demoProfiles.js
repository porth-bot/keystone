// Four scripted students that prove the engine is not hardcoded. Each profile is a sequence of
// (questionId, chosenChoiceIndex) answers -- real answers on real questions, so the misconception
// tags flow through to the intervention layer. The engine derives correctness and skill itself.
//
// | Profile | True gap             | Expected diagnosis   |
// |---------|----------------------|----------------------|
// | A       | function composition | function_composition |
// | B       | chain-rule procedure | chain_rule           |
// | C       | exponent / algebra   | exponent_rules       |
// | D       | only 2 mixed answers | insufficient evidence|
//
// Profile D is the important one: it proves the system refuses to force a confident answer.

export const DEMO_PROFILES = [
  {
    id: 'A',
    label: 'Ava: misses composition & chain, but powers through the power rule',
    trueGap: 'function_composition',
    expected: 'function_composition',
    answers: [
      ['q_comp_1', 1], // wrong: composed in the wrong order
      ['q_pow_1', 0], // right: power rule fine
      ['q_chain_1', 3], // wrong: used inner function instead of its derivative
      ['q_comp_2', 1], // wrong: wrong composition order again
      ['q_pow_2', 0], // right: power rule fine
      ['q_pq_1', 0], // right: product rule fine
    ],
  },
  {
    id: 'B',
    label: 'Ben: composes fine, differentiates powers fine, but the chain rule breaks',
    trueGap: 'chain_rule',
    expected: 'chain_rule',
    answers: [
      ['q_comp_1', 0], // right: composition fine (rules out a composition gap)
      ['q_pow_1', 0], // right: power rule fine
      ['q_pq_1', 0], // right: product rule fine (rules out gaps that route through the power rule)
      ['q_chain_1', 1], // wrong: omitted the inner derivative
      ['q_chain_2', 1], // wrong: omitted the inner derivative again
      ['q_impl_1', 2], // wrong: forgot the dy/dx factor (downstream of chain)
    ],
  },
  {
    id: 'C',
    label: 'Cam: exponent rules are shaky, so every derivative rule collapses',
    trueGap: 'exponent_rules',
    expected: 'exponent_rules',
    answers: [
      ['q_exp_1', 1], // wrong: multiplied the exponents
      ['q_exp_2', 1], // wrong: added the exponents (exponent gap confirmed directly)
      ['q_pow_1', 1], // wrong: dropped the coefficient
      ['q_pow_2', 1], // wrong: forgot to bring the exponent down
      ['q_chain_1', 1], // wrong: omitted the inner derivative
      ['q_comp_1', 0], // right: composition fine (rules out a composition gap)
      ['q_comp_2', 0], // right: composition fine
    ],
  },
  {
    id: 'D',
    label: 'Dana: only two answers in, and they point in different directions',
    trueGap: null,
    expected: 'insufficient',
    answers: [
      ['q_chain_1', 1], // wrong
      ['q_pow_1', 0], // right
    ],
  },
];

export const PROFILE_BY_ID = Object.fromEntries(DEMO_PROFILES.map((p) => [p.id, p]));
