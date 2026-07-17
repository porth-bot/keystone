// Prerequisite edges: [prerequisite, dependent].
// The graph is a DAG. Two edges carry the diagnostic story and MUST stay:
//   exponent_rules -> power_rule           (an exponent gap breaks every derivative rule, but NOT composition)
//   function_composition -> chain_rule     (a composition gap breaks the chain rule, but NOT the power rule)
// chain_rule has two parents (power_rule AND function_composition) on purpose: the chain rule genuinely
// needs both the mechanical rule and the idea of composition. That two-parent structure is what lets the
// engine separate "composition gap" from "chain-rule gap" from "exponent gap" using downstream evidence.

export const EDGES = [
  // foundations -> functions
  ['function_notation', 'function_composition'],
  ['function_notation', 'inverse_functions'],
  ['exponent_rules', 'exponential_log'],
  ['inverse_functions', 'exponential_log'],

  // foundations -> limits
  ['factoring', 'limit_laws'],
  ['limits_intuition', 'limit_laws'],
  ['limits_intuition', 'continuity'],

  // limits -> derivative definition
  ['function_notation', 'derivative_definition'],
  ['limit_laws', 'derivative_definition'],
  ['continuity', 'derivative_definition'],

  // derivative rules
  ['derivative_definition', 'power_rule'],
  ['exponent_rules', 'power_rule'], // KEY: exponent gap -> all derivatives
  ['fractions', 'product_quotient_rule'],
  ['power_rule', 'product_quotient_rule'],
  ['power_rule', 'chain_rule'], // part of "exponent breaks all derivatives"
  ['function_composition', 'chain_rule'], // KEY: composition gap -> chain (but not power)

  // higher derivatives
  ['product_quotient_rule', 'implicit_differentiation'],
  ['chain_rule', 'implicit_differentiation'],

  // applications
  ['chain_rule', 'related_rates'],
  ['implicit_differentiation', 'related_rates'],
  ['trig_functions', 'related_rates'], // trig shows up in related-rates setups, not as a chain-rule prereq
  ['factoring', 'optimization'],
  ['power_rule', 'optimization'],

  // integration
  ['power_rule', 'antiderivatives'],
  ['antiderivatives', 'u_substitution'],
  ['chain_rule', 'u_substitution'], // u-sub is "the chain rule in reverse"
];
