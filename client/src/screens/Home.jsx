import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { go } from '../router.js';
import { Igor, Loader, useApp, daysLabel } from '../ui.jsx';
import { startChat } from './Chat.jsx';

const TASK_ICONS = { review: '🔁', practice: '✏️', lesson: '📖', mock: '📝' };

export function startTask(t) {
  if (t.type === 'review') go('/practice', { purpose: 'review', task: t.id });
  else if (t.type === 'lesson') go(`/lesson/${t.topicId}`, { task: t.id });
  else if (t.type === 'mock') go(`/exam/${t.examId}`);
  else go('/practice', { topic: t.topicId, task: t.id, count: t.count || 5 });
}

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  return `${part}, ${name}!`;
}

const LINES = ['כל יום קצת = הרבה בסוף השנה 🌱', 'טעויות זה הדרך של המוח ללמוד 🧠', 'את יותר טובה ממה שאת חושבת 💜', 'צעד אחד בכל פעם. זה הכל.', 'היום נשבור עוד תרגיל ביחד 💪'];

export default function Home() {
  const { me, demo, profile } = useApp();
  const [data, setData] = useState(null);
  const [line] = useState(() => LINES[Math.floor(Math.random() * LINES.length)]);

  useEffect(() => {
    api.get('/api/home').then((d) => {
      setData(d);
      // מכין מראש תרגילים לנושא של היום – כדי שלא נחכה
      d.plan.filter((t) => t.topicId).forEach((t) => api.post('/api/practice/prefetch', { topicId: t.topicId }).catch(() => {}));
    });
  }, []);

  if (!data) return <Loader />;
  const { plan, streak, dueCount, exams } = data;
  const next = plan.find((t) => !t.done);
  const doneCount = plan.filter((t) => t.done).length;
  const totalMin = plan.filter((t) => !t.done).reduce((a, t) => a + (t.minutes || 0), 0);
  const nearExam = exams.find((e) => e.daysLeft <= 21);

  return (
    <>
      <div className="hero">
        <Igor size={64} bob />
        <div className="grow">
          <h1>{greeting(me.name)}</h1>
          <div className="muted small">{line}</div>
        </div>
        <button className="icon-btn" onClick={() => go('/settings')} aria-label="הגדרות">⚙️</button>
      </div>

      {demo && (
        <div className="card soft small">🧪 <b>מצב הדגמה</b> – עוד לא חובר מפתח API, אז איגור עונה תשובות לדוגמה. ראו את המדריך בקובץ README.</div>
      )}

      <div className="stat-row">
        <div className="stat"><b>🔥 {streak.streak}</b><span>ימים ברצף</span></div>
        <div className="stat"><b>⭐ {streak.totalXp}</b><span>נקודות · שלב {streak.level}</span></div>
        <div className="stat"><b>⏱️ {streak.today.minutes}</b><span>דקות היום</span></div>
      </div>

      {nearExam && (
        <button className="card tap row" style={{ background: 'var(--accent-soft)' }} onClick={() => go(`/exam/${nearExam.id}`)}>
          <span style={{ fontSize: 30 }}>📅</span>
          <span className="grow"><b>{nearExam.title}</b><br /><span className="small muted">{daysLabel(nearExam.daysLeft)} · לתוכנית ההכנה</span></span>
          <span className="muted">←</span>
        </button>
      )}

      <div className="card">
        <div className="row between">
          <h3>המשימות של היום</h3>
          <span className="badge">{doneCount}/{plan.length}</span>
        </div>
        <div>
          {plan.map((t) => (
            <button key={t.id} className={`task${t.done ? ' done' : ''}`} onClick={() => startTask(t)}>
              <span className="tico">{t.done ? '✅' : TASK_ICONS[t.type] || '✏️'}</span>
              <span className="grow">
                <span className="ttl bold">{t.title}</span><br />
                <span className="small muted">{t.subtitle} · {t.minutes} דק׳</span>
              </span>
              <span className="muted">←</span>
            </button>
          ))}
        </div>
        {next ? (
          <button className="btn block lg mt" onClick={() => startTask(next)}>
            {doneCount ? 'ממשיכים' : 'בואי נתחיל'} · {totalMin} דק׳ 🚀
          </button>
        ) : (
          <div className="center mt">
            <div style={{ fontSize: 34 }}>🏆</div>
            <b>סיימת את כל המשימות של היום!</b>
            <div className="small muted">אפשר לעצור כאן בגאווה, או להמשיך לתרגל בחופשיות.</div>
          </div>
        )}
      </div>

      <div className="quick">
        <button onClick={() => startChat('homework', { camera: true })}><span className="q-ico">📸</span><b>שיעורי בית</b><span>צלמי ונבין ביחד</span></button>
        <button onClick={() => startChat('chat')}><span className="q-ico">💬</span><b>שאלה לאיגור</b><span>על כל דבר במתמטיקה</span></button>
        <button onClick={() => startChat('check', { camera: true })}><span className="q-ico">✅</span><b>בדיקת פתרון</b><span>איפה טעיתי?</span></button>
        <button onClick={() => go('/mistakes')}><span className="q-ico">🔁</span><b>מחברת טעויות</b><span>{dueCount ? `${dueCount} מחכים לחזרה` : 'הכל מעודכן'}</span></button>
      </div>

      {!profile.diagnosticDone && (
        <button className="card tap row soft" onClick={() => go('/practice', { purpose: 'diagnostic' })}>
          <span style={{ fontSize: 30 }}>🧭</span>
          <span className="grow"><b>בדיקת היכרות (5 דק׳)</b><br /><span className="small muted">שאדע מאיפה להתחיל איתך. בלי ציון!</span></span>
        </button>
      )}

      <div className="card">
        <h3>השבוע שלך</h3>
        <div className="week mt">
          {streak.week.map((d) => (
            <div key={d.day}>
              {new Date(d.day + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'narrow' })}
              <i className={d.active ? 'on' : ''}>{d.active ? '✓' : ''}</i>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
