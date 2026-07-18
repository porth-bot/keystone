// The center-stage question. Two modes share one look:
//   mode "answer"  -> choices are clickable (mouse or keys A-D / 1-4); the student is actually working.
//   mode "review"  -> read-only; shows the chosen answer with correct/incorrect feedback and, on a
//                     miss, the misconception tag that becomes diagnostic evidence.
//
// Choices are displayed in a seeded-shuffled order (stable per question, so re-renders don't move
// answers around) because the banks store the correct choice first; without the shuffle the right
// answer would always be "A". All indices passed in/out (chosenIndex, onAnswer) are ORIGINAL bank
// indices; the shuffle is purely presentational.

import { useEffect, useMemo } from 'react';
import { skillName } from '../data/skills.js';

const clean = (t) => t?.replaceAll(' — ', ': ');

function seededOrder(question) {
  const s = `${question.skill ?? ''}|${question.prompt}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const idx = question.choices.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export default function QuestionCard({
  question,
  mode,
  chosenIndex = null,
  onAnswer,
  caption,
  count,
  metaLabel = 'tests',
}) {
  const order = useMemo(() => (question ? seededOrder(question) : []), [question]);
  const answered = mode === 'review' || chosenIndex != null;

  // Keyboard answering: A-D or 1-4 select the displayed choice at that position.
  useEffect(() => {
    if (mode !== 'answer' || answered || !question) return;
    const fn = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      let pos = -1;
      if (k >= 'a' && k <= 'h') pos = k.charCodeAt(0) - 97;
      else if (k >= '1' && k <= '9') pos = Number(k) - 1;
      if (pos >= 0 && pos < order.length) {
        e.preventDefault();
        onAnswer(order[pos]);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [mode, answered, question, order, onAnswer]);

  if (!question) return null;

  return (
    <div className="panel">
      <div className="q-meta">
        <span className="q-skill">{metaLabel} · {skillName(question.skill)}</span>
        {count && <span className="q-count">{count}</span>}
      </div>
      <div className="q-prompt">{clean(question.prompt)}</div>

      <div className="choices">
        {order.map((orig, pos) => {
          const c = question.choices[orig];
          const isChosen = orig === chosenIndex;
          const isCorrect = orig === question.ans;
          let cls = 'choice';
          if (answered && isChosen && isCorrect) cls += ' correct';
          else if (answered && isChosen && !isCorrect) cls += ' wrong';
          else if (answered && isCorrect) cls += ' correct';

          const content = (
            <>
              <span className="key">{String.fromCharCode(65 + pos)}</span>
              <span>
                {clean(c.t)}
                {answered && isChosen && !isCorrect && c.tag && (
                  <span className="tag">↳ misread as: {clean(c.tag)}</span>
                )}
              </span>
            </>
          );

          return mode === 'answer' && !answered ? (
            <button key={orig} className={cls} onClick={() => onAnswer(orig)}>
              {content}
            </button>
          ) : (
            <div key={orig} className={cls}>{content}</div>
          );
        })}
      </div>

      {caption && <p className="caption">{caption}</p>}
    </div>
  );
}
