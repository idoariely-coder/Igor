import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { go } from '../router.js';
import { Igor, Loader, MathText, speak, useApp } from '../ui.jsx';
import AnswerBox from '../Answer.jsx';
import { checkLocally } from '../../../shared/check.js';
import { findSubtopic } from '../../../shared/curriculum.js';
import { startChat } from './Chat.jsx';

const KIND = {
  explain: { label: '💡 הסבר', color: 'var(--primary)' },
  example: { label: '🔍 דוגמה', color: '#0ea5e9' },
  try: { label: '✏️ נסי בעצמך', color: 'var(--accent)' },
  tip: { label: '⭐ טיפ', color: '#16a34a' },
};

export default function Lesson({ topicId, query }) {
  const { celebrate, profile } = useApp();
  const t = findSubtopic(topicId);
  const [lesson, setLesson] = useState(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [showHint, setShowHint] = useState({});
  const [loadingFresh, setLoadingFresh] = useState(false);
  const [err, setErr] = useState(false);

  const load = (fresh) => {
    setLoadingFresh(true);
    api.get(`/api/lessons/${topicId}${fresh ? '?fresh=1' : ''}`)
      .then((r) => { setLesson(r.lesson); setI(0); setAnswers({}); setResults({}); setShowHint({}); })
      .catch(() => setErr(true))
      .finally(() => setLoadingFresh(false));
  };
  useEffect(() => { load(false); }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="empty" style={{ paddingTop: 60 }}><div className="big">😕</div>לא הצלחתי להכין את השיעור<br /><button className="btn mt" onClick={() => go(`/topic/${topicId}`)}>חזרה</button></div>;
  if (!lesson || loadingFresh) return <Loader text={`מכין לך שיעור על ${t?.title || ''}…`} />;

  const cards = lesson.cards;
  const done = i >= cards.length;

  if (done) {
    return (
      <div className="center" style={{ padding: 'calc(40px + var(--safe-t)) 16px', maxWidth: 520, margin: '0 auto' }}>
        <Igor size={100} bob />
        <h1>סיימת את השיעור! 🎉</h1>
        <p>עכשיו הזמן הכי טוב לתרגל – ככה זה נכנס לזיכרון.</p>
        <div className="col">
          <button className="btn lg block" onClick={() => go('/practice', { topic: topicId })}>✏️ לתרגול</button>
          <button className="btn block ghost" onClick={() => startChat('topic', { topicId, text: `למדתי עכשיו את "${t.title}". יש לי שאלה:` })}>💬 יש לי שאלה</button>
          <button className="btn block plain" onClick={() => go('/')}>להיום שלי</button>
        </div>
      </div>
    );
  }

  const c = cards[i];
  const isTry = c.kind === 'try' && c.question;
  const res = results[i];
  const canNext = !isTry || res?.correct || res?.revealed;

  const check = async () => {
    const q = { prompt: c.question, answer_type: c.answer_type, choices: c.choices, answer: c.answer };
    const a = answers[i] || '';
    let correct = checkLocally(q, a);
    let feedback = '';
    if (correct === null) {
      const r = await api.post('/api/practice/check-free', { question: q, answer: a }).catch(() => ({ correct: false }));
      correct = r.correct;
      feedback = r.feedback;
    }
    setResults((x) => ({ ...x, [i]: { correct, feedback, tries: (x[i]?.tries || 0) + 1 } }));
    if (correct) celebrate();
  };

  const next = () => {
    if (i + 1 >= cards.length) {
      api.post(`/api/lessons/${topicId}/done`).catch(() => {});
      if (query.task) api.post(`/api/plan/${query.task}/done`).catch(() => {});
    }
    setI(i + 1);
  };

  return (
    <div style={{ padding: 'calc(10px + var(--safe-t)) 16px calc(24px + var(--safe-b))', maxWidth: 640, margin: '0 auto' }}>
      <div className="row between">
        <button className="back" onClick={() => go(`/topic/${topicId}`)} aria-label="יציאה">✕</button>
        <div className="small bold">{lesson.title}</div>
        <span className="tiny muted">{i + 1}/{cards.length}</span>
      </div>
      <div className="bar mt mb"><i style={{ width: `${((i + 1) / cards.length) * 100}%` }} /></div>

      <div className="qcard lesson-card" key={i}>
        <div className="row between">
          <span className="lesson-kind" style={{ color: KIND[c.kind]?.color }}>{KIND[c.kind]?.label}</span>
          {profile.voice !== false && <button className="btn plain sm" onClick={() => speak(`${c.title}. ${c.body}. ${c.question || ''}`)} aria-label="הקראה">🔊</button>}
        </div>
        <h2 style={{ marginTop: 6 }}>{c.title}</h2>
        <MathText>{c.body}</MathText>

        {isTry && (
          <div className="mt">
            <MathText className="qprompt">{c.question}</MathText>
            <AnswerBox question={c} value={answers[i] || ''} onChange={(v) => setAnswers((x) => ({ ...x, [i]: v }))} onSubmit={check} locked={res?.correct || res?.revealed} correctAnswer={res?.revealed || res?.correct ? c.answer : null} wasCorrect={res?.correct} />
            {showHint[i] && c.hint && <div className="hint small"><b>💡 רמז:</b> <MathText>{c.hint}</MathText></div>}
            {res && (
              <div className={`feedback ${res.correct ? 'good' : 'almost'}`}>
                <b>{res.correct ? 'נכון! 🎉' : res.revealed ? 'הנה הפתרון 👇' : 'כמעט! נסי שוב 💪'}</b>
                {res.feedback && <MathText className="small">{res.feedback}</MathText>}
                {(res.correct || res.revealed) && c.solution && <MathText className="small mt">{c.solution}</MathText>}
              </div>
            )}
            {!res?.correct && !res?.revealed && (
              <div className="row mt" style={{ gap: 8 }}>
                <button className="btn grow" disabled={!String(answers[i] || '').trim()} onClick={check}>בדיקה</button>
                {c.hint && !showHint[i] && <button className="btn ghost" onClick={() => setShowHint((x) => ({ ...x, [i]: true }))}>💡</button>}
                {res?.tries >= 1 && <button className="btn plain" onClick={() => setResults((x) => ({ ...x, [i]: { ...x[i], revealed: true } }))}>פתרון</button>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="row mt" style={{ gap: 8 }}>
        {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}>→</button>}
        <button className="btn lg grow" disabled={!canNext} onClick={next}>{i + 1 >= cards.length ? 'סיום ✓' : 'הבא ←'}</button>
      </div>
      <div className="row mt" style={{ justifyContent: 'center', gap: 4 }}>
        <button className="btn plain sm" onClick={() => load(true)}>🔄 הסבר אחר</button>
        <button className="btn plain sm" onClick={() => startChat('topic', { topicId, context: `השיעור שלה: ${lesson.title}. הכרטיס הנוכחי: ${c.title} – ${c.body}`, text: `לא הבנתי את החלק הזה: "${c.title}". אפשר להסביר אחרת?` })}>🤔 לא הבנתי</button>
      </div>
    </div>
  );
}
