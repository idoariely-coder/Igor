import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { go } from '../router.js';
import { Igor, Loader, MathText, useApp } from '../ui.jsx';
import AnswerBox from '../Answer.jsx';
import { findSubtopic } from '../../../shared/curriculum.js';
import { startChat } from './Chat.jsx';

const PRAISE = ['מושלם! 🎉', 'יש! בדיוק ככה 💜', 'וואו, תותחית 🔥', 'נכון! את בעניינים ⭐', 'בול! 🎯'];
const ALMOST = ['כמעט! נסי עוד פעם 💪', 'לא בדיוק – אבל את קרובה. עוד ניסיון?', 'אופס, משהו קטן התפספס. נסי שוב 🙂'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const TITLES = { review: '🔁 חזרה חכמה', diagnostic: '🧭 בדיקת היכרות' };

export default function Practice({ query }) {
  const { celebrate, toast } = useApp();
  const purpose = query.purpose || 'practice';
  const topic = findSubtopic(query.topic);
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [tries, setTries] = useState(0);
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState(null); // {correct, feedback, done, solution, answer, xp}
  const [checking, setChecking] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [log, setLog] = useState([]); // [{correct, topic_id}]
  const [xp, setXp] = useState(0);
  const [mastery, setMastery] = useState(null);
  const [twinLoading, setTwinLoading] = useState(false);

  useEffect(() => {
    api.post('/api/practice/start', { topicId: query.topic, count: Number(query.count) || (purpose === 'review' ? 8 : 5), purpose })
      .then((r) => setQuestions(r.questions))
      .catch(() => setError('לא הצלחתי להכין תרגילים כרגע 😕'));
  }, [query.topic, query.count, purpose]);

  const finished = questions && idx >= questions.length;
  useEffect(() => {
    if (!finished) return;
    if (query.task) api.post(`/api/plan/${query.task}/done`).catch(() => {});
    if (purpose === 'diagnostic') api.post('/api/diagnostic/done').catch(() => {});
    if (log.length && log.filter((l) => l.correct).length / log.length >= 0.6) celebrate();
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="main"><div className="empty"><div className="big">😕</div>{error}<br /><button className="btn mt" onClick={() => go('/')}>חזרה</button></div></div>;
  if (!questions) return <Loader text={purpose === 'review' ? 'מביא את התרגילים לחזרה…' : 'איגור מכין לך תרגילים…'} />;

  if (!questions.length) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div className="big">✨</div>
        <h2>אין כרגע מה לחזור עליו</h2>
        <p>כל הטעויות מטופלות. אלופה!</p>
        <button className="btn" onClick={() => { if (query.task) api.post(`/api/plan/${query.task}/done`); go('/'); }}>חזרה הביתה</button>
      </div>
    );
  }

  if (finished) return <Summary log={log} xp={xp} mastery={mastery} topic={topic} purpose={purpose} query={query} />;

  const q = questions[idx];
  const locked = !!result?.done;

  const check = async (final = false, giveUp = false) => {
    if (!giveUp && !String(answer).trim()) return;
    setChecking(true);
    try {
      const r = await api.post('/api/practice/check', { qid: q.qid, answer: giveUp ? '' : answer, hintsUsed: hints, final: final || giveUp || tries >= 1, source: purpose });
      setResult(r);
      if (r.done) {
        setLog((l) => [...l, { correct: r.correct, topic_id: q.topic_id }]);
        setXp((x) => x + (r.xp || 0));
        if (r.mastery !== undefined) setMastery(r.mastery);
        if (!r.correct) setShowSolution(true);
      } else {
        setTries((t) => t + 1);
      }
    } catch {
      toast('לא הצלחתי לבדוק, נסי שוב');
    } finally {
      setChecking(false);
    }
  };

  const next = () => {
    setIdx((i) => i + 1);
    setAnswer('');
    setTries(0);
    setHints(0);
    setResult(null);
    setShowSolution(false);
  };

  const twin = async () => {
    setTwinLoading(true);
    try {
      const r = await api.post('/api/practice/twin', { qid: q.qid });
      setQuestions((qs) => [...qs.slice(0, idx + 1), r.question, ...qs.slice(idx + 1)]);
      next();
    } catch {
      toast('לא הצלחתי ליצור תרגיל תאום');
    } finally {
      setTwinLoading(false);
    }
  };

  const askIgor = () => startChat('practice', {
    topicId: q.topic_id,
    context: `התרגיל: ${q.prompt}`,
    text: `נתקעתי בתרגיל הזה:\n\n${q.prompt}${answer ? `\n\nניסיתי: ${answer}` : ''}\n\nאפשר עזרה?`,
  });

  const qTopic = findSubtopic(q.topic_id);

  return (
    <div style={{ padding: 'calc(10px + var(--safe-t)) 16px calc(24px + var(--safe-b))', maxWidth: 680, margin: '0 auto' }}>
      <div className="row between">
        <button className="back" onClick={() => go('/')} aria-label="יציאה">✕</button>
        <div className="small bold">{TITLES[purpose] || topic?.title}</div>
        <span className="badge">⭐ {xp}</span>
      </div>
      <div className="progress-dots" style={{ marginTop: 10 }}>
        {questions.map((_, i) => <i key={i} className={i < log.length ? (log[i].correct ? 'ok' : 'no') : i === idx ? 'on' : ''} />)}
      </div>

      <div className="qcard">
        <div className="row between">
          <span className="tiny muted">{qTopic?.title}{q.skill ? ` · ${q.skill}` : ''}</span>
          <span className="tiny muted">{'●'.repeat(q.difficulty || 1)}{'○'.repeat(3 - (q.difficulty || 1))}</span>
        </div>
        <MathText className="qprompt">{q.prompt}</MathText>

        <AnswerBox question={q} value={answer} onChange={(v) => { setAnswer(v); if (result && !result.done) setResult(null); }} onSubmit={() => !locked && check()} locked={locked} correctAnswer={result?.answer} wasCorrect={result?.correct} />

        {q.hints?.slice(0, hints).map((h, i) => (
          <div key={i} className="hint small"><b>💡 רמז {i + 1}:</b> <MathText>{h}</MathText></div>
        ))}

        {result && (
          <div className={`feedback ${result.correct ? 'good' : 'almost'}`}>
            <b>{result.correct ? pick(PRAISE) : result.done ? 'לא נורא! בואי נראה איך פותרים 👇' : pick(ALMOST)}</b>
            {result.feedback && <MathText className="small mt">{result.feedback}</MathText>}
            {result.done && !result.correct && result.mistakeId && <div className="tiny muted mt">🔁 שמרתי את התרגיל במחברת הטעויות – נחזור אליו מחר</div>}
          </div>
        )}

        {locked && (
          <>
            {result.correct && !showSolution && <button className="btn plain sm mt" onClick={() => setShowSolution(true)}>איך פותרים? 👀</button>}
            {showSolution && result.solution && (
              <div className="card soft mt" style={{ marginBottom: 0 }}>
                <div className="small bold mb" style={{ marginBottom: 6 }}>הפתרון:</div>
                <MathText>{result.solution}</MathText>
              </div>
            )}
          </>
        )}
      </div>

      <div className="col mt">
        {!locked ? (
          <>
            <button className="btn lg block" disabled={checking || !String(answer).trim()} onClick={() => check()}>{checking ? 'בודק…' : 'בדיקה'}</button>
            <div className="row" style={{ gap: 8 }}>
              {hints < (q.hints?.length || 0) && <button className="btn ghost grow" onClick={() => setHints((h) => h + 1)}>💡 רמז</button>}
              <button className="btn ghost grow" onClick={askIgor}>💬 איגור</button>
              <button className="btn plain grow" disabled={checking} onClick={() => check(true, true)}>🤷 לא יודעת</button>
            </div>
          </>
        ) : (
          <>
            <button className="btn lg block" onClick={next}>{idx + 1 < questions.length ? 'הבא ←' : 'סיום 🎉'}</button>
            {!result.correct && (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost grow" disabled={twinLoading} onClick={twin}>{twinLoading ? 'מכין…' : '✏️ תרגיל תאום'}</button>
                <button className="btn ghost grow" onClick={() => startChat('mistake', { topicId: q.topic_id, context: `התרגיל: ${q.prompt}\nהתשובה הנכונה: ${result.answer}\nהפתרון: ${result.solution}`, text: `טעיתי בתרגיל הזה ולא הבנתי למה:\n\n${q.prompt}\n\nאני עניתי: ${answer || '(לא ידעתי)'}` })}>💬 למה?</button>
              </div>
            )}
          </>
        )}
      </div>
      {result?.correct && <MiniParty />}
    </div>
  );
}

function MiniParty() {
  const { celebrate } = useApp();
  useEffect(() => { if (Math.random() < 0.35) celebrate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Summary({ log, xp, mastery, topic, purpose, query }) {
  const right = log.filter((l) => l.correct).length;
  const ratio = log.length ? right / log.length : 0;
  const msg = ratio >= 0.8 ? 'מדהים! את ממש שולטת בזה 🌟' : ratio >= 0.5 ? 'עבודה יפה! עוד קצת תרגול וזה שלך 💪' : 'כל הכבוד שהתמדת! ככה לומדים – נחזור על זה ביחד 💜';
  const weakTopics = purpose === 'diagnostic' ? [...new Set(log.filter((l) => !l.correct).map((l) => findSubtopic(l.topic_id)?.title).filter(Boolean))] : [];

  return (
    <div style={{ padding: 'calc(30px + var(--safe-t)) 16px', maxWidth: 560, margin: '0 auto' }} className="center">
      <Igor size={100} bob />
      <h1>{purpose === 'diagnostic' ? 'סיימנו את ההיכרות! 🎉' : 'סיימת סבב!'}</h1>
      <p>{purpose === 'diagnostic' ? 'עכשיו אני יודע בדיוק איך לעזור לך. המשימות היומיות שלך יתאימו את עצמן.' : msg}</p>
      <div className="stat-row">
        <div className="stat"><b>{right}/{log.length}</b><span>נכונות</span></div>
        <div className="stat"><b>+{xp}</b><span>נקודות</span></div>
        <div className="stat"><b>{mastery !== null ? Math.round(mastery) : '—'}</b><span>שליטה בנושא</span></div>
      </div>
      {weakTopics.length > 0 && (
        <div className="card" style={{ textAlign: 'start' }}>
          <b>נחזק ביחד:</b>
          <div className="chips wrap mt">{weakTopics.map((t) => <span key={t} className="chip">{t}</span>)}</div>
        </div>
      )}
      <div className="col mt">
        {topic && <button className="btn lg block" onClick={() => go('/practice', { topic: topic.id, r: Date.now() })}>עוד סבב ✏️</button>}
        <button className={`btn block ${topic ? 'ghost' : 'lg'}`} onClick={() => go('/')}>חזרה להיום שלי</button>
        <p className="tiny muted">💡 טיפ: הפסקה קצרה עכשיו עוזרת לזכור את מה שתרגלת</p>
      </div>
    </div>
  );
}
