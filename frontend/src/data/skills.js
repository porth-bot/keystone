// The 20-skill single-variable calculus map.
// `tier` drives the left-to-right layout of the prerequisite graph:
//   0 foundations -> 1 functions -> 2 limits -> 3 derivatives -> 4 applications -> 5 integration
// Skill ids are stable string keys used everywhere (edges, questions, profiles, params).

export const SKILLS = [
  // Tier 0 - algebra foundations
  { id: 'exponent_rules', name: 'Exponent & radical rules', tier: 0 },
  { id: 'factoring', name: 'Factoring & algebraic manipulation', tier: 0 },
  { id: 'fractions', name: 'Rational / fraction arithmetic', tier: 0 },
  { id: 'function_notation', name: 'Function notation & evaluation', tier: 0 },

  // Tier 1 - functions
  { id: 'function_composition', name: 'Function composition', tier: 1 },
  { id: 'inverse_functions', name: 'Inverse functions', tier: 1 },
  { id: 'trig_functions', name: 'Trigonometric functions', tier: 1 },
  { id: 'exponential_log', name: 'Exponential & log functions', tier: 1 },

  // Tier 2 - limits
  { id: 'limits_intuition', name: 'Limits (graphical / numeric)', tier: 2 },
  { id: 'limit_laws', name: 'Limit laws & algebraic limits', tier: 2 },
  { id: 'continuity', name: 'Continuity', tier: 2 },

  // Tier 3 - derivatives
  { id: 'derivative_definition', name: 'Derivative as a limit', tier: 3 },
  { id: 'power_rule', name: 'Power rule', tier: 3 },
  { id: 'product_quotient_rule', name: 'Product & quotient rules', tier: 3 },
  { id: 'chain_rule', name: 'Chain rule', tier: 3 },
  { id: 'implicit_differentiation', name: 'Implicit differentiation', tier: 3 },

  // Tier 4 - applications
  { id: 'related_rates', name: 'Related rates', tier: 4 },
  { id: 'optimization', name: 'Optimization / critical points', tier: 4 },

  // Tier 5 - integration
  { id: 'antiderivatives', name: 'Antiderivatives', tier: 5 },
  { id: 'u_substitution', name: 'u-substitution', tier: 5 },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export const skillName = (id) => SKILL_BY_ID[id]?.name ?? id;
