// Layer 4 + the verification loop — the differentiator. We hand Claude structured evidence, it
// returns a micro-lesson + one verification question. The student answers it, BKT re-measures the
// keystone skill, and we show before% -> after%. This is the "close the loop" step: diagnose, fix,
// AND verify. Honestly labeled as an updated estimate, not proof.

export default function InterventionPanel({ lesson, loading, onGenerate, verify, canGenerate }) {
  return (
    <div className="panel">
      <h2>
        Intervention <span className="layer-tag">· Layer 4: reteach + verify</span>
        {lesson && (
          <span className={`source-badge ${lesson.source}`} style={{ marginLeft: 8 }}>
            {lesson.source === 'claude' ? 'Claude' : 'deterministic fallback'}
          </span>
        )}
      </h2>

      {!lesson && (
        <>
          <p className="hint">
            The model has located the gap. Claude now writes a targeted micro-lesson from the
            student's exact misconception, then a question to re-measure mastery.
          </p>
          <button className="primary" onClick={onGenerate} disabled={!canGenerate || loading}>
            {loading ? 'Generating…' : 'Generate targeted lesson'}
          </button>
        </>
      )}

      {lesson && (
        <>
          <div className="lesson-block">
            <div className="lbl">Misconception</div>
            <div className="body">{lesson.misconception}</div>
          </div>
          <div className="lesson-block">
            <div className="lbl">Analogy</div>
            <div className="body">{lesson.analogy}</div>
          </div>
          <div className="lesson-block">
            <div className="lbl">Worked example</div>
            <div className="body mono" style={{ fontSize: 13 }}>{lesson.workedExample}</div>
          </div>

          <div className="lesson-block">
            <div className="lbl">Verification question</div>
            <div className="body">{lesson.verification.prompt}</div>
          </div>
          <div className="choices">
            {lesson.verification.choices.map((c, i) => {
              const answered = verify.answeredIndex != null;
              const isCorrect = i === lesson.verification.answerIndex;
              const isChosen = i === verify.answeredIndex;
              let cls = 'choice';
              if (answered && isChosen && isCorrect) cls += ' correct';
              else if (answered && isChosen && !isCorrect) cls += ' wrong';
              else if (answered && isCorrect) cls += ' correct';
              return (
                <button
                  key={i}
                  className={cls}
                  disabled={answered}
                  onClick={() => verify.onAnswer(i)}
                >
                  <span className="key">{String.fromCharCode(65 + i)}</span>
                  <span>{c}</span>
                </button>
              );
            })}
          </div>

          {verify.answeredIndex != null && (
            <>
              <div className="delta">
                <div className="bars">
                  <div className="row before">
                    <span className="cap">before</span>
                    <span className="bar"><span style={{ width: `${Math.round(verify.before * 100)}%` }} /></span>
                    <span className="num">{Math.round(verify.before * 100)}%</span>
                  </div>
                  <div className="row after">
                    <span className="cap">after</span>
                    <span className="bar"><span style={{ width: `${Math.round(verify.after * 100)}%` }} /></span>
                    <span className="num">{Math.round(verify.after * 100)}%</span>
                  </div>
                </div>
              </div>
              <p className="honesty">
                Updated mastery estimate on the keystone skill, not proof of learning. More
                verification questions would tighten it.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
