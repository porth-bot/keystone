// Headless anti-hardcode test: run each scripted demo profile through the FULL engine pipeline and
// assert the diagnosis matches its expected column. Run with:  node tests/test_profiles.js
// (or `npm test` from frontend/). Exits non-zero on any failure so CI can gate on it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SKILLS, skillName } from '../frontend/src/data/skills.js';
import { EDGES } from '../frontend/src/data/edges.js';
import { QUESTIONS, toObservation } from '../frontend/src/data/questions.js';
import { DEMO_PROFILES } from '../frontend/src/data/demoProfiles.js';
import { buildGraph } from '../frontend/src/engine/graph.js';
import { buildHypotheses, diagnose } from '../frontend/src/engine/diagnosis.js';
import { selectNextQuestion } from '../frontend/src/engine/selection.js';

const here = dirname(fileURLToPath(import.meta.url));
const params = JSON.parse(readFileSync(join(here, '../frontend/src/data/parameters.json'), 'utf8'));

const skillIds = SKILLS.map((s) => s.id);
const graph = buildGraph(skillIds, EDGES);
const hypotheses = buildHypotheses(skillIds, graph);

let failures = 0;
const check = (name, cond, detail = '') => {
  const mark = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`  [${mark}] ${name}${detail ? ' — ' + detail : ''}`);
};

console.log('Demo-profile diagnosis tests\n');
for (const p of DEMO_PROFILES) {
  const obs = p.answers.map(([q, c]) => toObservation(q, c));
  const d = diagnose(obs, skillIds, graph, { hypotheses, params });
  const got = d.sufficient ? d.keystone : 'insufficient';
  const want = p.expected;
  const ok = want === 'insufficient' ? !d.sufficient : d.sufficient && d.keystone === want;
  check(
    `Profile ${p.id}: ${want === 'insufficient' ? 'insufficient evidence' : skillName(want)}`,
    ok,
    `got ${d.sufficient ? skillName(got) : 'insufficient evidence'} (top ${Math.round(d.top.prob * 100)}%)`,
  );
}

console.log('\nEngine invariant tests\n');
// The two discriminating edges must hold or the "why not chain rule" story breaks.
const descComp = new Set(graph.descendants['function_composition']);
const descExp = new Set(graph.descendants['exponent_rules']);
check('composition gap breaks chain rule', descComp.has('chain_rule'));
check('composition gap does NOT break power rule', !descComp.has('power_rule'));
check('exponent gap breaks power rule', descExp.has('power_rule'));
check('exponent gap does NOT break composition', !descExp.has('function_composition'));

// Selection returns a real question with positive information gain from a blank slate.
const first = selectNextQuestion(QUESTIONS, [], skillIds, graph, { hypotheses, params });
check('info-gain selection yields a question', !!first?.question);
check('info-gain of first question is positive', first.infoGain > 0, `gain=${first.infoGain.toFixed(3)}`);

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
