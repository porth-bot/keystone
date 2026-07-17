# Rubric mapping

How each scored dimension is earned, with pointers into the repo.

## Educational Impact

- **Real problem, stated plainly.** Teachers and students see *where* an error happened, not the
  prerequisite misconception that caused it. Drilling the visible errors treats symptoms.
- **Quantified.** The teacher summary card turns the diagnosis into numbers: one keystone skill, N
  downstream skills it unblocks, the confidence, and the evidence count
  (`frontend/src/components/TeacherSummary.jsx`).
- **Targeted remediation.** Claude writes a micro-lesson from the student's exact observed error tags,
  not a generic solution (`frontend/src/services/claude.js`).
- **Closed loop.** A verification question re-measures mastery and shows before% / after%
  (`frontend/src/components/InterventionPanel.jsx`). The honesty label makes clear it is an updated
  estimate, not proof.

## Creative Use of AI/ML

Four connected layers, each doing a job the others cannot:

1. Sequential mastery model (Bayesian Knowledge Tracing) — `frontend/src/engine/bkt.js`
2. Graph-based root-cause posterior over hypotheses — `frontend/src/engine/diagnosis.js`
3. Information-gain question selection (entropy reduction) — `frontend/src/engine/selection.js`
4. Evidence-constrained generative intervention (Claude) — `frontend/src/services/claude.js`

The defensible separation: the model finds the gap, the LLM only explains it. Claude is fed structured
evidence and never decides the keystone. Remove any layer and the product stops working, which is what
makes the AI inseparable from the product rather than a bolt-on chat box.

## Technical Execution

- **Honest, calibrated model with real numbers.** In-app synthetic-cohort validation (AUC 0.775 vs 0.699
  vs 0.500 for the baselines) and an offline EM fit + held-out evaluation in `evaluation/` (pure Python).
  The EM fitter recovers generating parameters to ~0.01 MAE.
- **Live probabilistic updates.** The posterior and the graph update per answer.
- **Automated tests.** `tests/test_profiles.js` runs the four profiles and the graph invariants headless
  and exits non-zero on failure; the app renders the same PASS/FAIL live.
- **Graceful uncertainty.** The insufficient-evidence gate (Profile D) refuses to force a confident
  answer.
- **API fallback.** Deterministic fallback lessons keep the demo alive if the API key is absent, bad, or
  rate-limited.

## Pitch & Demo

One problem (symptoms vs cause), one student (Profile A), one surprising diagnosis (composition, not the
chain rule), one targeted fix, one verified result, one line: *what missing idea made that error
inevitable?*

## Honesty checklist (self-audit)

- [x] No claim that the model was trained on real calculus students.
- [x] No fabricated target metrics; every number is what the scripts actually computed.
- [x] In-browser numbers labeled "synthetic cohort, not real students."
- [x] The ASSISTments real-data path is optional and has not been run; no ASSISTments numbers claimed.
- [x] The verification step is labeled an updated estimate, not proof of learning.
