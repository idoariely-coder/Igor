import { useRef, useState } from 'react';
import { MathText } from './ui.jsx';
import MathKeyboard from './MathKeyboard.jsx';

const PLACEHOLDERS = {
  number: 'התשובה (למשל 3 או 3/4)',
  numbers: 'כל הפתרונות, מופרדים בפסיק (למשל 2, -3)',
  expression: 'התשובה שלך',
};

/** תיבת תשובה: בחירה מרובה או הקלדה עם מקלדת מתמטית */
export default function AnswerBox({ question, value, onChange, onSubmit, locked, correctAnswer, wasCorrect }) {
  const inputRef = useRef(null);
  const [kb, setKb] = useState(false);

  if (question.answer_type === 'choice' && question.choices?.length) {
    return (
      <div className="choices">
        {question.choices.map((c) => {
          let cls = 'choice';
          if (locked && correctAnswer && c === correctAnswer) cls += ' right';
          else if (locked && value === c && !wasCorrect) cls += ' wrong';
          else if (value === c) cls += ' sel';
          return (
            <button key={c} className={cls} disabled={locked} onClick={() => onChange(c)}>
              <MathText>{c}</MathText>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <input
          ref={inputRef}
          className="input answer-input grow"
          inputMode={question.answer_type === 'expression' ? 'text' : 'decimal'}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={PLACEHOLDERS[question.answer_type] || 'התשובה שלך'}
          value={value}
          disabled={locked}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
          dir="ltr"
        />
        {!locked && (
          <button type="button" className="icon-btn" onClick={() => setKb((k) => !k)} aria-label="מקלדת מתמטית" style={kb ? { background: 'var(--primary)', color: 'var(--on-primary)' } : undefined}>∑</button>
        )}
      </div>
      {kb && !locked && <MathKeyboard targetRef={inputRef} setValue={onChange} onClose={() => setKb(false)} />}
    </div>
  );
}
