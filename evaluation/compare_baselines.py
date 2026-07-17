#!/usr/bin/env python3
"""
compare_baselines.py -- Baseline next-answer predictors for Keystone.

These are the simple reference predictors that BKT is compared against in
evaluate.py. They deliberately use no latent-state model, so they set an
honest floor: if BKT cannot beat them, the extra machinery is not earning its
keep.

Predictors (each returns P(next answer correct), in [0, 1]):

    majority(base_rate)
        Predict the global base correctness rate for everyone, ignoring the
        student's own history. This is the "always guess the prior" baseline.

    previous_answer(history, base_rate)
        Predict the student's last observed result on this skill (1.0 if the
        previous attempt was correct, 0.0 if incorrect). If the student has no
        prior attempts on the skill, fall back to the base rate.

Importable as a module; also runnable standalone for a tiny demo.
Standard library only.
"""


def majority_predict(base_rate):
    """Constant prediction: the global base correctness rate."""
    return base_rate


def previous_answer_predict(history, base_rate):
    """
    Predict from the most recent prior result on the same skill.

    Parameters
    ----------
    history : list[int]
        The student's prior 0/1 responses on this skill, in order (may be empty).
    base_rate : float
        Fallback used when there is no prior attempt.
    """
    if history:
        return float(history[-1])
    return base_rate


def compute_base_rate(sequences):
    """
    Global base correctness rate over a list of 0/1 sequences.

    Used as the majority prediction and as the previous_answer fallback. Should
    be computed on TRAINING observations only (do not peek at held-out labels).
    """
    total = 0
    correct = 0
    for seq in sequences:
        for obs in seq:
            total += 1
            correct += obs
    return correct / total if total else 0.5


def _demo():
    """Tiny self-contained demonstration."""
    train = [
        [0, 1, 1],
        [0, 0, 1],
        [1, 1, 1],
        [0, 1, 0],
    ]
    base = compute_base_rate(train)
    print("compare_baselines.py demo")
    print("-" * 40)
    print("training sequences : %s" % train)
    print("global base rate   : %.3f" % base)
    print()
    print("majority prediction (constant): %.3f" % majority_predict(base))
    print()
    examples = [
        ("student with last=correct",   [0, 1, 1]),
        ("student with last=incorrect", [1, 1, 0]),
        ("student with no history",     []),
    ]
    for label, hist in examples:
        p = previous_answer_predict(hist, base)
        print("previous_answer  %-28s history=%-10s -> %.3f"
              % (label, hist, p))


if __name__ == "__main__":
    _demo()
