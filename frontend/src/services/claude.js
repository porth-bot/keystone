// Layer 4: the intervention. The model (layers 1-3) has ALREADY decided the keystone; Claude only
// explains it. Claude never picks the gap. We hand Claude structured diagnostic evidence and ask
// for strict JSON: misconception, analogy, worked example, and one verification question.
//
// If no API key is present (the default), or the API fails, we fall back to deterministic lessons
// for the common keystones so the demo never breaks. The UI labels which path produced the lesson.

const ANTHROPIC_MODEL = 'claude-opus-4-8'; // configurable; only used when an API key is supplied

const SYSTEM_PROMPT = `You are the remediation author inside Keystone, a calculus diagnostic tutor.
A separate Bayesian model has already identified the single "keystone" prerequisite skill that is
causing a student's mistakes. Your ONLY job is to explain that specific skill and check it. You do
not choose the skill and you do not diagnose.

Return ONLY a JSON object (no markdown, no code fences, no prose before or after) with EXACTLY:
{
  "misconception": "one sentence naming the specific wrong mental model, in plain language",
  "analogy": "a short concrete analogy that reframes the idea",
  "workedExample": "one short worked example with the key step highlighted in words",
  "verification": {
    "prompt": "one new question that tests the SAME keystone skill",
    "choices": ["correct answer", "distractor", "distractor", "distractor"],
    "answerIndex": 0
  }
}
Keep every field tight. Use the student's observed error tags. Put the correct answer at answerIndex.`;

function buildUserPrompt(evidence) {
  return [
    `Keystone skill: ${evidence.skillName} (id: ${evidence.skill})`,
    `Current mastery estimate: ${(evidence.masteryProb * 100).toFixed(0)}%`,
    `Diagnostic confidence: ${(evidence.diagnosticConfidence * 100).toFixed(0)}%`,
    `Observed error tags: ${evidence.errorTags?.length ? evidence.errorTags.join('; ') : 'none recorded'}`,
    `Prerequisites the student has mastered: ${evidence.masteredPrereqs?.join(', ') || 'n/a'}`,
    `Skills currently blocked downstream: ${evidence.blockedSkills?.join(', ') || 'n/a'}`,
    '',
    'Write the micro-lesson JSON for this exact keystone skill.',
  ].join('\n');
}

const stripFences = (t) =>
  t.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

function isValidLesson(o) {
  return (
    o &&
    typeof o.misconception === 'string' &&
    typeof o.analogy === 'string' &&
    typeof o.workedExample === 'string' &&
    o.verification &&
    typeof o.verification.prompt === 'string' &&
    Array.isArray(o.verification.choices) &&
    o.verification.choices.length >= 2 &&
    Number.isInteger(o.verification.answerIndex)
  );
}

export async function generateIntervention(evidence, { apiKey } = {}) {
  if (!apiKey) {
    return { source: 'fallback', reason: 'no API key set', ...fallbackLesson(evidence) };
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(evidence) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = await res.json();
    const text = data.content?.find((b) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(stripFences(text));
    if (!isValidLesson(parsed)) throw new Error('response failed schema check');
    return { source: 'claude', model: ANTHROPIC_MODEL, ...parsed };
  } catch (err) {
    // Deterministic fallback keeps the demo alive if the API key is bad, rate-limited, or offline.
    return { source: 'fallback', reason: String(err.message || err), ...fallbackLesson(evidence) };
  }
}

// ---- Deterministic fallback lessons for the common keystones -------------------------------------

const FALLBACKS = {
  function_composition: {
    misconception: 'You apply the outer function before the inner one, or compose them in the wrong order.',
    analogy: 'Composition is a factory line: g runs first and hands its output to f. f(g(x)) means "do g, then feed that result into f", never the reverse.',
    workedExample: 'f(x)=x+1, g(x)=x^2. Then f(g(x)) = f(x^2) = x^2 + 1. The inner output x^2 becomes f\'s input, so you add 1 to x^2, not to x.',
    verification: {
      prompt: 'If f(x) = 2x and g(x) = x + 3, what is f(g(x))?',
      choices: ['2(x + 3) = 2x + 6', '2x + 3', 'x + 3', '2x·(x + 3)'],
      answerIndex: 0,
    },
  },
  chain_rule: {
    misconception: 'You differentiate the outer function but forget to multiply by the derivative of the inside.',
    analogy: 'The chain rule is peeling an onion: differentiate the outer layer, then multiply by how fast the inner layer changes. Skip the inside and your rate is missing a factor.',
    workedExample: 'd/dx (3x+1)^4 = 4(3x+1)^3 · d/dx(3x+1) = 4(3x+1)^3 · 3 = 12(3x+1)^3. The extra ·3 is the inner derivative you must not drop.',
    verification: {
      prompt: 'Differentiate f(x) = (5x − 2)^3.',
      choices: ['15(5x − 2)^2', '3(5x − 2)^2', '15(5x − 2)^3', '(5x − 2)^2'],
      answerIndex: 0,
    },
  },
  exponent_rules: {
    misconception: 'You multiply exponents when multiplying same-base powers, mixing up the product rule with the power rule.',
    analogy: 'x^a · x^b just stacks copies: x^2·x^3 is (xx)(xxx) = five x\'s = x^5. You ADD exponents when multiplying; you MULTIPLY exponents only when raising a power to a power.',
    workedExample: 'x^5 · x^3 = x^(5+3) = x^8. But (x^5)^3 = x^(5·3) = x^15. Different operations, different rules.',
    verification: {
      prompt: 'Simplify x^4 · x^2.',
      choices: ['x^6', 'x^8', 'x^2', '2x^6'],
      answerIndex: 0,
    },
  },
  power_rule: {
    misconception: 'You forget to bring the exponent down as a coefficient, or you do not reduce the exponent by one.',
    analogy: 'The power rule is a trade that happens together, every time: the exponent hops to the front as a multiplier, and the exponent itself drops by one.',
    workedExample: 'd/dx x^5 = 5·x^(5−1) = 5x^4. The 5 comes down front; the exponent becomes 4.',
    verification: {
      prompt: 'Differentiate f(x) = x^7.',
      choices: ['7x^6', 'x^6', '7x^7', '7x^8'],
      answerIndex: 0,
    },
  },
  product_quotient_rule: {
    misconception: 'You multiply the two derivatives together instead of "first times derivative of second, plus second times derivative of first."',
    analogy: 'The product rule shares the work: each factor takes a turn being differentiated while the other stays put, and you add the two turns.',
    workedExample: 'd/dx [x^2 · sin x] = (2x)(sin x) + (x^2)(cos x), not (2x)(cos x).',
    verification: {
      prompt: 'Differentiate f(x) = x · e^x.',
      choices: ['e^x + x·e^x', '1·e^x', 'x·e^x', 'e^x'],
      answerIndex: 0,
    },
  },
  implicit_differentiation: {
    misconception: 'You differentiate y-terms as if y were a constant, forgetting the dy/dx factor.',
    analogy: 'y is a secret function of x. Every time you differentiate a y, the chain rule tacks on a dy/dx, the reminder that y depends on x.',
    workedExample: 'x^2 + y^2 = 25 → 2x + 2y·(dy/dx) = 0 → dy/dx = −x/y. The 2y·(dy/dx) is the piece people drop.',
    verification: {
      prompt: 'Given y^2 = x, find dy/dx.',
      choices: ['1/(2y)', '2y', '1', '2x'],
      answerIndex: 0,
    },
  },
};

const GENERIC = (evidence) => ({
  misconception: `The mistakes trace back to ${evidence.skillName}, an earlier skill the later work depends on.`,
  analogy: 'Think of the prerequisite as the foundation: when it is shaky, everything built on top wobbles even if that upper work is done correctly.',
  workedExample: `Re-establish ${evidence.skillName} on a simple case first, then re-attempt the harder problem. The harder problem was failing because this step underneath it was.`,
  verification: {
    prompt: `Solve one clean, isolated ${evidence.skillName} problem before returning to the harder material.`,
    choices: ['I can do the isolated version', 'I still miss the isolated version'],
    answerIndex: 0,
  },
});

export function fallbackLesson(evidence) {
  return FALLBACKS[evidence.skill] ?? GENERIC(evidence);
}
