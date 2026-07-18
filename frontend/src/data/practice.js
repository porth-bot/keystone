// Per-keystone practice banks for the verify loop. When Claude is generating lessons live it also
// writes fresh practice questions; these banks are the deterministic path, so "next question" always
// produces a genuinely new question even fully offline. Same shape as the diagnostic bank
// ({ prompt, ans, choices: [{ t, tag? }] }); the correct choice carries no tag. Choices are shuffled
// at render time, so storing the correct answer first is not a tell.

export const PRACTICE_BANK = {
  function_composition: [
    {
      prompt: 'If f(x) = x^2 and g(x) = 3x + 1, what is f(g(x))?',
      ans: 0,
      choices: [
        { t: '(3x + 1)^2' },
        { t: '3x^2 + 1', tag: 'composed in the wrong order' },
        { t: 'x^2 (3x + 1)', tag: 'multiplied f and g instead of composing' },
        { t: '3x^2 + x', tag: 'blended the two functions together' },
      ],
    },
    {
      prompt: 'h(x) = √(x + 5). If h(x) = f(g(x)) with f(x) = √x, what is g(x)?',
      ans: 0,
      choices: [
        { t: 'g(x) = x + 5' },
        { t: 'g(x) = √x', tag: 'assigned the outer function to g' },
        { t: 'g(x) = √(x + 5)', tag: 'made g the whole function' },
        { t: 'g(x) = 5', tag: 'dropped the variable from the inner function' },
      ],
    },
    {
      prompt: 'If f(x) = 1/x and g(x) = x - 2, what is f(g(x))?',
      ans: 0,
      choices: [
        { t: '1 / (x - 2)' },
        { t: '(1/x) - 2', tag: 'composed in the wrong order' },
        { t: '1/x - 1/2', tag: 'applied the outer function to each term' },
        { t: 'x - 2', tag: 'forgot to apply the outer function' },
      ],
    },
  ],

  chain_rule: [
    {
      prompt: 'Differentiate: f(x) = (2x + 5)^4',
      ans: 0,
      choices: [
        { t: '8(2x + 5)^3' },
        { t: '4(2x + 5)^3', tag: 'omitted the inner derivative' },
        { t: '8(2x + 5)^4', tag: 'did not reduce the exponent' },
        { t: '2(2x + 5)^3', tag: 'used the inner derivative but dropped the outer coefficient' },
      ],
    },
    {
      prompt: 'Differentiate: f(x) = cos(3x)',
      ans: 0,
      choices: [
        { t: '-3 sin(3x)' },
        { t: '-sin(3x)', tag: 'omitted the inner derivative' },
        { t: '3 sin(3x)', tag: 'lost the negative from the cosine derivative' },
        { t: '-3 cos(3x)', tag: 'did not change cosine to sine' },
      ],
    },
    {
      prompt: 'Differentiate: f(x) = e^(x^2)',
      ans: 0,
      choices: [
        { t: '2x · e^(x^2)' },
        { t: 'e^(x^2)', tag: 'omitted the inner derivative' },
        { t: 'x^2 · e^(x^2 - 1)', tag: 'treated the exponential like the power rule' },
        { t: '2x · e^(2x)', tag: 'differentiated inside the exponent too' },
      ],
    },
  ],

  exponent_rules: [
    {
      prompt: 'Simplify: x^6 / x^2',
      ans: 0,
      choices: [
        { t: 'x^4' },
        { t: 'x^3', tag: 'divided the exponents' },
        { t: 'x^8', tag: 'added the exponents' },
        { t: 'x^12', tag: 'multiplied the exponents' },
      ],
    },
    {
      prompt: 'Simplify: (2x^2)^3',
      ans: 0,
      choices: [
        { t: '8x^6' },
        { t: '2x^6', tag: 'forgot to cube the coefficient' },
        { t: '8x^5', tag: 'added the exponents instead of multiplying' },
        { t: '6x^6', tag: 'multiplied the coefficient by the exponent' },
      ],
    },
    {
      prompt: 'Which of these equals x^(-3)?',
      ans: 0,
      choices: [
        { t: '1 / x^3' },
        { t: '-x^3', tag: 'treated the negative exponent as a negative number' },
        { t: 'x^(1/3)', tag: 'confused a negative exponent with a root' },
        { t: '-3x', tag: 'multiplied the base by the exponent' },
      ],
    },
  ],

  power_rule: [
    {
      prompt: 'Differentiate: f(x) = x^9',
      ans: 0,
      choices: [
        { t: '9x^8' },
        { t: 'x^8', tag: 'reduced the exponent without bringing it down' },
        { t: '9x^9', tag: 'did not reduce the exponent' },
        { t: 'x^10 / 10', tag: 'integrated instead of differentiating' },
      ],
    },
    {
      prompt: 'Differentiate: f(x) = 4x^3',
      ans: 0,
      choices: [
        { t: '12x^2' },
        { t: '4x^2', tag: 'forgot to multiply by the exponent' },
        { t: '12x^3', tag: 'did not reduce the exponent' },
        { t: '7x^2', tag: 'added the coefficient and the exponent' },
      ],
    },
    {
      prompt: 'Differentiate: f(x) = x^2 + 5x',
      ans: 0,
      choices: [
        { t: '2x + 5' },
        { t: '2x', tag: 'dropped the linear term' },
        { t: '2x + 5x', tag: 'did not differentiate the second term' },
        { t: 'x + 5', tag: 'reduced the exponent without multiplying by it' },
      ],
    },
  ],

  product_quotient_rule: [
    {
      prompt: 'Differentiate: f(x) = x^3 · cos(x)',
      ans: 0,
      choices: [
        { t: '3x^2 cos(x) - x^3 sin(x)' },
        { t: '-3x^2 sin(x)', tag: 'multiplied the two derivatives' },
        { t: '3x^2 cos(x) + x^3 sin(x)', tag: 'lost the negative from the sine derivative' },
        { t: '3x^2 cos(x)', tag: 'differentiated only the first factor' },
      ],
    },
    {
      prompt: 'Differentiate: f(x) = x · ln(x)',
      ans: 0,
      choices: [
        { t: 'ln(x) + 1' },
        { t: '1/x', tag: 'multiplied the two derivatives' },
        { t: 'ln(x)', tag: 'differentiated only the first factor' },
        { t: '1', tag: 'differentiated only the second factor' },
      ],
    },
    {
      prompt: 'Differentiate: f(x) = sin(x) / x',
      ans: 0,
      choices: [
        { t: '(x cos(x) - sin(x)) / x^2' },
        { t: 'cos(x)', tag: 'differentiated only the numerator' },
        { t: '(sin(x) - x cos(x)) / x^2', tag: 'flipped the order in the quotient rule' },
        { t: 'cos(x) / 1', tag: 'took derivative of top over derivative of bottom' },
      ],
    },
  ],

  implicit_differentiation: [
    {
      prompt: 'Given x^2 + y^3 = 7, find dy/dx.',
      ans: 0,
      choices: [
        { t: '-2x / (3y^2)' },
        { t: '-2x', tag: 'forgot the dy/dx factor on the y term' },
        { t: '2x / (3y^2)', tag: 'sign error moving terms across' },
        { t: '-2x / (3y)', tag: 'did not differentiate y^3 fully' },
      ],
    },
    {
      prompt: 'Given x · y = 12, find dy/dx.',
      ans: 0,
      choices: [
        { t: '-y / x' },
        { t: 'y / x', tag: 'sign error moving terms across' },
        { t: '-x / y', tag: 'flipped the ratio' },
        { t: 'y + x', tag: 'differentiated but did not solve for dy/dx' },
      ],
    },
    {
      prompt: 'Given sin(y) = x, find dy/dx.',
      ans: 0,
      choices: [
        { t: '1 / cos(y)' },
        { t: 'cos(y)', tag: 'did not solve for dy/dx' },
        { t: '-1 / cos(y)', tag: 'sign error on the sine derivative' },
        { t: 'cos(x)', tag: 'differentiated with respect to the wrong variable' },
      ],
    },
  ],
};
