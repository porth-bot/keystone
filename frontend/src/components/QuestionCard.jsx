// The center-stage question. Two modes share one look:
//   mode "answer"  -> choices are clickable; the student is actually taking the diagnostic.
//   mode "review"  -> read-only; shows the choice that was played (auto-demo), with correct/incorrect
//                     feedback and the misconception tag, so a viewer sees evidence being gathered.
// The caption shows WHY this question was asked (the info-gain rationale) — the adaptivity, visible.

import { skillName } from '../data/skills.js';

const clean = (t) => t?.replaceAll(' — ', ': ');

export default function QuestionCard({ question, mode, chosenIndex = null, onAnswer, caption, count }) {
  if (!question) return null;
  const answered = mode === 'review' || chosenIndex != null;

  return (
    <div className="panel">
      <div className="q-meta">
        <span className="q-skill">tests · {skillName(question.skill)}</span>
        {count && <span className="q-count">{count}</span>}
      </div>
      <div className="q-prompt">{clean(question.prompt)}</div>

      <div className="choices">
        {question.choices.map((c, i) => {
          const isChosen = i === chosenIndex;
          const isCorrect = i === question.ans;
          let cls = 'choice';
          if (answered && isChosen && isCorrect) cls += ' correct';
          else if (answered && isChosen && !isCorrect) cls += ' wrong';
          else if (answered && isCorrect) cls += ' correct';

          const content = (
            <>
              <span className="key">{String.fromCharCode(65 + i)}</span>
              <span>
                {clean(c.t)}
                {answered && isChosen && !isCorrect && c.tag && (
                  <span className="tag">↳ misread as: {clean(c.tag)}</span>
                )}
              </span>
            </>
          );

          return mode === 'answer' && !answered ? (
            <button key={i} className={cls} onClick={() => onAnswer(i)}>
              {content}
            </button>
          ) : (
            <div key={i} className={cls}>{content}</div>
          );
        })}
      </div>

      {caption && <p className="caption">{caption}</p>}
    </div>
  );
}
