#!/usr/bin/env python3
"""
fit_bkt.py -- Fit a 4-parameter Bayesian Knowledge Tracing (BKT) model.

Keystone Layer-1 validation.

Each skill is modelled as a 2-state Hidden Markov Model with per-skill
parameters {L0, T, G, S}:

    L0 : P(skill already known at the first opportunity)   (prior)
    T  : P(unknown -> known) between opportunities          (learn / transition)
    G  : P(correct | skill NOT known)                       (guess)
    S  : P(incorrect | skill known)                         (slip)

Single-observation update rule (used for on-line prediction):

    p_correct = L*(1 - S) + (1 - L)*G
    posterior | correct   = L*(1 - S) / p_correct
    posterior | incorrect = L*S / (L*S + (1 - L)*(1 - G))
    L_new = posterior + (1 - posterior)*T

DEFAULT PATH (in-repo):
    Generate a *synthetic* cohort from a set of ground-truth BKT parameters,
    then fit the parameters back from the observed responses ONLY (the fitter
    never sees the hidden mastery states or the true parameters). We then print
    fitted-vs-true so you can see the estimator recovers the generator.

    ** The default cohort is SYNTHETIC. It is NOT real students. **

OPTIONAL REAL-DATA PATH:
    Pass --data <file.csv> to fit on a real dataset instead (e.g. the public
    ASSISTments 2009-2010 skill-builder set). If the file is missing the script
    prints how to obtain it and exits 0 (nothing is fabricated).

Runs on the Python standard library alone. Deterministic (seeded).
"""

import argparse
import csv
import json
import math
import os
import random
import sys

# --------------------------------------------------------------------------- #
# Skill set and ground-truth generator parameters (synthetic path).
#
# These are a hand-designed calculus prerequisite chain. The values below are
# the *generator* parameters used only to synthesise data; the fitter is not
# allowed to look at them.
# --------------------------------------------------------------------------- #
SKILLS = ["limits", "continuity", "derivatives", "chain_rule", "integrals"]

TRUE_PARAMS = {
    "limits":      {"L0": 0.30, "T": 0.20, "G": 0.20, "S": 0.10},
    "continuity":  {"L0": 0.25, "T": 0.15, "G": 0.25, "S": 0.08},
    "derivatives": {"L0": 0.20, "T": 0.25, "G": 0.15, "S": 0.12},
    "chain_rule":  {"L0": 0.15, "T": 0.18, "G": 0.22, "S": 0.15},
    "integrals":   {"L0": 0.10, "T": 0.22, "G": 0.18, "S": 0.10},
}

# Identifiability constraints on the noise parameters.
G_MAX = 0.30
S_MAX = 0.30

DEFAULT_N_STUDENTS = 600
DEFAULT_OPPS = 10          # opportunities (attempts) per skill per student
DEFAULT_SEED = 20260717


# --------------------------------------------------------------------------- #
# BKT core: single-observation prediction + belief update.
# --------------------------------------------------------------------------- #
def bkt_predict(L, G, S):
    """P(next answer correct) given current mastery belief L."""
    return L * (1.0 - S) + (1.0 - L) * G


def bkt_update(L, correct, T, G, S):
    """
    Bayesian posterior after one observation, followed by the learning
    transition. Returns the updated mastery belief for the *next* opportunity.
    """
    if correct:
        num = L * (1.0 - S)
        den = L * (1.0 - S) + (1.0 - L) * G
    else:
        num = L * S
        den = L * S + (1.0 - L) * (1.0 - G)
    posterior = num / den if den > 0 else L
    return posterior + (1.0 - posterior) * T


# --------------------------------------------------------------------------- #
# Synthetic cohort generation.
#
# Generative process per (student, skill), matching the update rule above:
#   state_1 ~ Bernoulli(L0)
#   at opportunity t: answer correct w.p. (1-S) if known else G
#   after answering: if not known, transition to known w.p. T
#
# We return ONLY the observed 0/1 responses. Hidden states are discarded so the
# fitter cannot cheat.
# --------------------------------------------------------------------------- #
def generate_cohort(n_students=DEFAULT_N_STUDENTS, opps=DEFAULT_OPPS,
                    seed=DEFAULT_SEED):
    """
    Return a list of students. Each student is a dict:
        { skill_name: [0/1, 0/1, ...] }   # one response list per skill
    """
    rng = random.Random(seed)
    cohort = []
    for _ in range(n_students):
        student = {}
        for skill in SKILLS:
            p = TRUE_PARAMS[skill]
            L0, T, G, S = p["L0"], p["T"], p["G"], p["S"]
            known = rng.random() < L0
            seq = []
            for _t in range(opps):
                if known:
                    correct = rng.random() < (1.0 - S)
                else:
                    correct = rng.random() < G
                seq.append(1 if correct else 0)
                if not known and rng.random() < T:
                    known = True
            student[skill] = seq
        cohort.append(student)
    return cohort


def cohort_to_sequences(cohort):
    """Group a cohort into {skill: [seq, seq, ...]} for per-skill fitting."""
    by_skill = {s: [] for s in SKILLS}
    for student in cohort:
        for skill, seq in student.items():
            by_skill[skill].append(seq)
    return by_skill


# --------------------------------------------------------------------------- #
# EM (Baum-Welch) for a single skill.
#
# The HMM has two hidden states: 0 = unknown, 1 = known.
#   initial : P(known) = L0
#   trans   : unknown->known = T, known->known = 1 (no forgetting)
#   emit    : P(correct|unknown) = G, P(correct|known) = 1 - S
#
# We run forward-backward to get expected sufficient statistics and re-estimate
# {L0, T, G, S} in closed form, clipping G,S to their identifiability caps.
# Multiple random restarts guard against local optima.
# --------------------------------------------------------------------------- #
def _emit(state, obs, G, S):
    """Emission probability P(obs | state)."""
    if state == 0:                      # unknown
        return G if obs == 1 else (1.0 - G)
    else:                               # known
        return (1.0 - S) if obs == 1 else S


def _forward_backward(seq, L0, T, G, S):
    """
    Run forward-backward on one sequence. Returns a dict of the sufficient
    statistics this sequence contributes, plus its log-likelihood.
    """
    n = len(seq)
    # Transition matrix A[i][j] = P(state_{t+1}=j | state_t=i)
    A = [[1.0 - T, T],   # from unknown
         [0.0, 1.0]]     # from known (no forgetting)

    # ---- forward ----
    alpha = [[0.0, 0.0] for _ in range(n)]
    alpha[0][0] = (1.0 - L0) * _emit(0, seq[0], G, S)
    alpha[0][1] = L0 * _emit(1, seq[0], G, S)
    for t in range(1, n):
        for j in (0, 1):
            s = alpha[t - 1][0] * A[0][j] + alpha[t - 1][1] * A[1][j]
            alpha[t][j] = s * _emit(j, seq[t], G, S)

    p_obs = alpha[n - 1][0] + alpha[n - 1][1]
    if p_obs <= 0.0:
        # Degenerate params for this sequence; contribute nothing.
        return None

    # ---- backward ----
    beta = [[0.0, 0.0] for _ in range(n)]
    beta[n - 1][0] = 1.0
    beta[n - 1][1] = 1.0
    for t in range(n - 2, -1, -1):
        for i in (0, 1):
            beta[t][i] = sum(
                A[i][j] * _emit(j, seq[t + 1], G, S) * beta[t + 1][j]
                for j in (0, 1)
            )

    # ---- gamma_t(state) ----
    gamma = [[alpha[t][i] * beta[t][i] / p_obs for i in (0, 1)] for t in range(n)]

    # Sufficient statistics.
    stats = {
        "gamma1_known": gamma[0][1],
        "trans_num": 0.0,   # expected unknown->known transitions
        "trans_den": 0.0,   # expected time spent unknown (t = 0..n-2)
        "g_num": 0.0,       # expected (unknown & correct)
        "g_den": 0.0,       # expected time unknown (all t)
        "s_num": 0.0,       # expected (known & incorrect)
        "s_den": 0.0,       # expected time known (all t)
        "logL": math.log(p_obs),
    }

    for t in range(n - 1):
        # xi_t(unknown -> known)
        xi_uk = (alpha[t][0] * A[0][1] *
                 _emit(1, seq[t + 1], G, S) * beta[t + 1][1]) / p_obs
        stats["trans_num"] += xi_uk
        stats["trans_den"] += gamma[t][0]

    for t in range(n):
        g_unknown = gamma[t][0]
        g_known = gamma[t][1]
        stats["g_den"] += g_unknown
        stats["s_den"] += g_known
        if seq[t] == 1:
            stats["g_num"] += g_unknown
        else:
            stats["s_num"] += g_known

    return stats


def _clip(x, lo, hi):
    return max(lo, min(hi, x))


def em_fit_skill(sequences, n_iter=60, n_restarts=4, seed=0):
    """
    Fit {L0, T, G, S} for a single skill from a list of 0/1 sequences.
    Returns (params_dict, log_likelihood).
    """
    rng = random.Random(seed)
    best = None
    best_ll = float("-inf")

    for _restart in range(n_restarts):
        # Random but plausible initialisation.
        L0 = rng.uniform(0.10, 0.40)
        T = rng.uniform(0.10, 0.30)
        G = rng.uniform(0.10, 0.30)
        S = rng.uniform(0.05, 0.30)

        last_ll = float("-inf")
        for _it in range(n_iter):
            agg = {"gamma1_known": 0.0, "trans_num": 0.0, "trans_den": 0.0,
                   "g_num": 0.0, "g_den": 0.0, "s_num": 0.0, "s_den": 0.0}
            total_ll = 0.0
            n_seq = 0
            for seq in sequences:
                if not seq:
                    continue
                st = _forward_backward(seq, L0, T, G, S)
                if st is None:
                    continue
                n_seq += 1
                total_ll += st["logL"]
                for k in agg:
                    agg[k] += st[k]

            if n_seq == 0:
                break

            # M-step (with small floors/caps for stability + identifiability).
            L0 = _clip(agg["gamma1_known"] / n_seq, 0.01, 0.99)
            T = _clip(agg["trans_num"] / agg["trans_den"], 0.01, 0.99) \
                if agg["trans_den"] > 0 else T
            G = _clip(agg["g_num"] / agg["g_den"], 0.01, G_MAX) \
                if agg["g_den"] > 0 else G
            S = _clip(agg["s_num"] / agg["s_den"], 0.01, S_MAX) \
                if agg["s_den"] > 0 else S

            # Convergence check.
            if abs(total_ll - last_ll) < 1e-6:
                last_ll = total_ll
                break
            last_ll = total_ll

        if last_ll > best_ll:
            best_ll = last_ll
            best = {"L0": L0, "T": T, "G": G, "S": S}

    return best, best_ll


def fit_all_skills(by_skill, n_iter=60, n_restarts=4, seed=0):
    """Fit every skill. Returns {skill: {L0,T,G,S}}."""
    fitted = {}
    lls = {}
    for i, skill in enumerate(sorted(by_skill.keys())):
        params, ll = em_fit_skill(by_skill[skill], n_iter=n_iter,
                                   n_restarts=n_restarts, seed=seed + i)
        fitted[skill] = params
        lls[skill] = ll
    return fitted, lls


# --------------------------------------------------------------------------- #
# Real-data (ASSISTments-style) loading.
# --------------------------------------------------------------------------- #
ASSISTMENTS_INSTRUCTIONS = """\
Real-data path requested but no dataset file was found at:
    {path}

This repository does NOT redistribute any student data. To run the optional
real-data validation, download a public dataset yourself, for example the
ASSISTments 2009-2010 "skill-builder" set (public, de-identified student math
responses). It is available from the ASSISTments data page:
    https://sites.google.com/site/assistmentsdata/home
or from public Kaggle mirrors (search: "ASSISTments 2009 2010 skill builder").

Save it as a CSV with (at least) these columns and re-run:
    - a student id column     (default header: user_id)
    - a skill id column       (default header: skill_id)
    - a 0/1 correctness column(default header: correct)
Optionally an order column (default header: order_id) to sort attempts in time.

Then:
    python3 fit_bkt.py --data path/to/skill_builder_data.csv

Override column names if your file differs, e.g.:
    python3 fit_bkt.py --data data.csv --student-col studentId \\
        --skill-col skillName --correct-col correct --order-col order_id

Exiting cleanly (no numbers fabricated).
"""


def load_real_data(path, student_col, skill_col, correct_col, order_col):
    """
    Load a real CSV into {skill: [seq, ...]}.

    Rows are grouped by (student, skill) and, if an order column is present,
    sorted in time so the response sequences are chronological.
    """
    rows = []
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        reader = csv.DictReader(fh)
        headers = reader.fieldnames or []
        for needed in (student_col, skill_col, correct_col):
            if needed not in headers:
                raise ValueError(
                    "Column '%s' not found. Available columns: %s"
                    % (needed, ", ".join(headers))
                )
        has_order = order_col in headers
        for r in reader:
            skill = (r.get(skill_col) or "").strip()
            student = (r.get(student_col) or "").strip()
            craw = (r.get(correct_col) or "").strip()
            if skill == "" or student == "" or craw == "":
                continue
            try:
                correct = 1 if int(float(craw)) == 1 else 0
            except ValueError:
                continue
            order = None
            if has_order:
                try:
                    order = float(r.get(order_col))
                except (TypeError, ValueError):
                    order = None
            rows.append((student, skill, order, correct))

    # Group into per-(student, skill) sequences.
    groups = {}
    for idx, (student, skill, order, correct) in enumerate(rows):
        key = (student, skill)
        groups.setdefault(key, []).append((order if order is not None else idx,
                                           idx, correct))

    by_skill = {}
    for (student, skill), items in groups.items():
        items.sort(key=lambda x: (x[0], x[1]))
        seq = [c for (_o, _i, c) in items]
        if seq:
            by_skill.setdefault(skill, []).append(seq)
    return by_skill


# --------------------------------------------------------------------------- #
# Reporting helpers.
# --------------------------------------------------------------------------- #
def print_synthetic_comparison(fitted):
    """Print fitted-vs-true for the synthetic path."""
    print()
    print("Fitted vs ground-truth parameters (SYNTHETIC cohort)")
    print("-" * 72)
    hdr = "%-13s %-6s %8s %8s %8s" % ("skill", "param", "true", "fitted", "abs_err")
    print(hdr)
    print("-" * 72)
    abs_errs = []
    for skill in SKILLS:
        t = TRUE_PARAMS[skill]
        f = fitted[skill]
        for pname in ("L0", "T", "G", "S"):
            err = abs(f[pname] - t[pname])
            abs_errs.append(err)
            print("%-13s %-6s %8.3f %8.3f %8.3f"
                  % (skill, pname, t[pname], f[pname], err))
        print("-" * 72)
    mae = sum(abs_errs) / len(abs_errs)
    print("Mean absolute error across all 20 parameters: %.4f" % mae)
    print("(Recovery from observations only; the fitter never saw the "
          "true params or hidden states.)")


# --------------------------------------------------------------------------- #
# Main.
# --------------------------------------------------------------------------- #
def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Fit a 4-parameter BKT model (synthetic by default).")
    parser.add_argument("--data", default=None,
                        help="Path to a real CSV dataset (ASSISTments-style). "
                             "If omitted, a synthetic cohort is used.")
    parser.add_argument("--student-col", default="user_id")
    parser.add_argument("--skill-col", default="skill_id")
    parser.add_argument("--correct-col", default="correct")
    parser.add_argument("--order-col", default="order_id")
    parser.add_argument("--students", type=int, default=DEFAULT_N_STUDENTS,
                        help="Synthetic cohort size (default %d)."
                             % DEFAULT_N_STUDENTS)
    parser.add_argument("--opps", type=int, default=DEFAULT_OPPS,
                        help="Attempts per skill in the synthetic cohort.")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--out", default=None,
                        help="Output JSON path (default parameters_fit.json "
                             "next to this script).")
    args = parser.parse_args(argv)

    here = os.path.dirname(os.path.abspath(__file__))
    out_path = args.out or os.path.join(here, "parameters_fit.json")

    # ----- Real-data path -----
    if args.data is not None:
        if not os.path.exists(args.data):
            print(ASSISTMENTS_INSTRUCTIONS.format(path=args.data))
            return 0
        print("Loading real dataset: %s" % args.data)
        by_skill = load_real_data(args.data, args.student_col, args.skill_col,
                                  args.correct_col, args.order_col)
        n_skills = len(by_skill)
        n_seq = sum(len(v) for v in by_skill.values())
        print("Loaded %d skills, %d student-skill sequences." % (n_skills, n_seq))
        if n_skills == 0:
            print("No usable sequences found. Check your column names.")
            return 0
        fitted, lls = fit_all_skills(by_skill, seed=args.seed)
        payload = {
            "dataset": "real_data",
            "source_file": os.path.abspath(args.data),
            "note": ("Fitted on a user-supplied real dataset. Metrics/params "
                     "reflect that file only; nothing here is fabricated."),
            "constraints": {"G_max": G_MAX, "S_max": S_MAX},
            "skills": fitted,
            "log_likelihood": lls,
        }
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, sort_keys=True)
        print("\nFitted parameters written to %s" % out_path)
        for skill in sorted(fitted):
            p = fitted[skill]
            print("  %-20s L0=%.3f T=%.3f G=%.3f S=%.3f"
                  % (skill, p["L0"], p["T"], p["G"], p["S"]))
        return 0

    # ----- Synthetic path (default) -----
    print("Keystone BKT fit -- SYNTHETIC cohort (NOT real students)")
    print("Generating cohort: %d students x %d skills x %d attempts (seed=%d)"
          % (args.students, len(SKILLS), args.opps, args.seed))
    cohort = generate_cohort(n_students=args.students, opps=args.opps,
                             seed=args.seed)
    by_skill = cohort_to_sequences(cohort)

    print("Fitting per-skill {L0, T, G, S} via EM (Baum-Welch) "
          "from observations only...")
    fitted, lls = fit_all_skills(by_skill, seed=args.seed)

    print_synthetic_comparison(fitted)

    payload = {
        "dataset": "synthetic_cohort",
        "note": ("SYNTHETIC data. Parameters were fit via EM from a cohort "
                 "generated by the BKT process itself. No real students were "
                 "used. Ground-truth params are included only to show "
                 "recovery quality."),
        "generator": {
            "n_students": args.students,
            "opportunities_per_skill": args.opps,
            "seed": args.seed,
        },
        "constraints": {"G_max": G_MAX, "S_max": S_MAX},
        "skills": fitted,
        "ground_truth_generator_params": TRUE_PARAMS,
        "log_likelihood": lls,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
    print("\nFitted parameters written to %s" % out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
