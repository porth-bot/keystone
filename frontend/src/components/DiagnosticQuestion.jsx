// Shows one question. In the scripted-demo flow the answer that the profile chose is highlighted
// (correct green / wrong red, with the misconception tag) so the viewer can see the evidence being
// gathered. `next` carries the info-gain recommendation for the NEXT question.

import { skillName } from '../data/skills.js';

export default function DiagnosticQuestion({ question, chosenIndex, next }) {
  if (!question) {
    return (
      <div className="panel">
        <h2>Diagnostic question <span className="layer-tag">· Layer 3: adaptive selection</span></h2>
        <p className="hint">Load a student profile to start gathering evidence.</p>
      </div>
    );
  }
  return (
    <div className="panel">
      <h2>Latest answer <span className="layer-tag">· {skillName(question.skill)}</span></h2>
      <div className="q-prompt">
        <span className="mono">{question.prompt}</span>
      </div>
      <div className="choices">
        {question.choices.map((c, i) => {
          const isChosen = i === chosenIndex;
          const isCorrect = i === question.ans;
          let cls = 'choice';
          if (isChosen && isCorrect) cls += ' correct';
          else if (isChosen && !isCorrect) cls += ' wrong';
          else if (isCorrect) cls += ' correct';
          return (
            <div key={i} className={cls}>
              <span className="key">{String.fromCharCode(65 + i)}</span>
              <span>
                {c.t}
                {isChosen && !isCorrect && c.tag && <span className="tag">student's error: {c.tag}</span>}
              </span>
            </div>
          );
        })}
      </div>
      {next && (
        <p className="hint">
          Best next question by information gain: <b>{skillName(next.question.skill)}</b>
          {next.separates.length === 2 && (
            <> — it best separates <b>{next.separates[0]}</b> vs <b>{next.separates[1]}</b>.</>
          )}
        </p>
      )}
    </div>
  );
}
