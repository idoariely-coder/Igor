import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { go } from '../router.js';
import { Igor, Loader, Ring, Switch, useApp, fmtDate, daysLabel } from '../ui.jsx';
import { ExamForm } from './Exams.jsx';

const MODE_ICON = { chat: '💬', homework: '📝', check: '✅', topic: '📖', mistake: '🔁', practice: '✏️', exam: '📅', note: '📓' };

export default function Parent() {
  const { me, toast, logout, demo } = useApp();
  const [d, setD] = useState(null);
  const [summary, setSummary] = useState('');
  const [sumBusy, setSumBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPin, setNewPin] = useState('');

  const load = () => api.get('/api/parent/overview').then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <Loader />;
  if (!d.student) return <div className="empty">אין תלמידה במערכת</div>;

  const s = d.student;
  const maxMin = Math.max(10, ...d.streak.week.map((w) => w.minutes));
  const weekMin = d.streak.week.reduce((a, w) => a + w.minutes, 0);
  const acc = d.week.total ? Math.round((d.week.correct / d.week.total) * 100) : null;
  const prevAcc = d.prevWeek.total ? Math.round((d.prevWeek.correct / d.prevWeek.total) * 100) : null;

  const setSetting = async (patch) => {
    await api.patch('/api/parent/student-settings', patch);
    toast('נשמר ✓');
    load();
  };

  const getSummary = async () => {
    setSumBusy(true);
    try {
      const r = await api.post('/api/parent/summary');
      setSummary(r.summary);
    } catch {
      toast('לא הצלחתי ליצור סיכום');
    } finally {
      setSumBusy(false);
    }
  };

  return (
    <>
      <div className="hero">
        <Igor size={56} avatar={s.profile.avatar || '🦉'} />
        <div className="grow">
          <h1>שלום {me.name} 👋</h1>
          <div className="muted small">ככה {s.name} מתקדמת עם איגור</div>
        </div>
        <button className="icon-btn" onClick={() => go('/settings')} aria-label="הגדרות">⚙️</button>
      </div>
      {demo && <div className="card soft small">🧪 מצב הדגמה – איגור עונה תשובות לדוגמה עד שיחובר מפתח API.</div>}

      <div className="stat-row">
        <div className="stat"><b>🔥 {d.streak.streak}</b><span>ימים ברצף</span></div>
        <div className="stat"><b>{weekMin}</b><span>דקות השבוע</span></div>
        <div className="stat"><b>{acc === null ? '—' : `${acc}%`}</b><span>הצלחה בתרגילים{prevAcc !== null && acc !== null ? ` (${acc >= prevAcc ? '↑' : '↓'} מ-${prevAcc}%)` : ''}</span></div>
      </div>

      <div className="card">
        <h3>השבוע האחרון</h3>
        <div className="row mt" style={{ alignItems: 'flex-end', height: 110, gap: 6 }}>
          {d.streak.week.map((w) => (
            <div key={w.day} className="grow center">
              <div className="tiny muted">{w.minutes || ''}</div>
              <div style={{ height: Math.max(4, (w.minutes / maxMin) * 70), background: w.active ? 'var(--primary)' : 'var(--line)', borderRadius: 6 }} />
              <div className="tiny muted">{new Date(w.day + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'narrow' })}</div>
            </div>
          ))}
        </div>
        <div className="tiny muted mt">{d.week.total} תרגילים · {d.openMistakes} טעויות פתוחות לחזרה · {d.resolvedMistakes} טעויות שכבר הובנו · {d.notesCount} שיעורים צולמו</div>
      </div>

      <div className="card soft">
        <div className="row between">
          <h3>✨ סיכום שבועי מאיגור</h3>
          <button className="btn sm" onClick={getSummary} disabled={sumBusy}>{sumBusy ? 'כותב…' : summary ? 'רענון' : 'יצירה'}</button>
        </div>
        {summary ? <p style={{ marginBottom: 0 }}>{summary}</p> : <p className="small muted" style={{ marginBottom: 0 }}>איגור יכתוב לכם בכמה משפטים מה הלך טוב, מה עוד קשה ואיך אפשר לעזור.</p>}
      </div>

      <div className="card">
        <div className="row between">
          <h3>📅 מבחנים קרובים</h3>
          <button className="btn sm ghost" onClick={() => setAdding(true)}>+ הוספה</button>
        </div>
        {!d.exams.length && <p className="small muted">אין מבחנים קרובים. אם ידוע לכם על מבחן – הוסיפו אותו ואיגור יבנה לה תוכנית הכנה.</p>}
        {d.exams.map((e) => (
          <div key={e.id} className="task">
            <span className="tico">📝</span>
            <span className="grow"><b>{e.title}</b><br /><span className="tiny muted">{fmtDate(e.date)} · {daysLabel(e.daysLeft)} · {e.plan.filter((p) => p.done).length}/{e.plan.length} שלבי הכנה</span></span>
          </div>
        ))}
        {d.mocks.length > 0 && <p className="small mt" style={{ marginBottom: 0 }}>ציוני מבחני דמה אחרונים: {d.mocks.map((m) => <span key={m.finished_at} className="badge good" style={{ marginInlineEnd: 4 }}>{m.score}</span>)}</p>}
      </div>

      <div className="card">
        <h3>📚 שליטה לפי פרקים</h3>
        {d.units.map((u) => (
          <div key={u.id} className="sub">
            <span style={{ fontSize: 22 }}>{u.emoji}</span>
            <span className="grow"><b>{u.title}</b><br /><span className="tiny muted">{u.practiced}/{u.total} נושאים תורגלו</span></span>
            <Ring value={u.score} color={u.color} size={42} />
          </div>
        ))}
      </div>

      {d.byTopic.length > 0 && (
        <div className="card">
          <h3>✏️ על מה תרגלה השבוע</h3>
          {d.byTopic.map((t) => (
            <div key={t.topic} className="row between small" style={{ padding: '6px 0' }}>
              <span>{t.topic}</span>
              <span className="muted">{t.n} תרגילים · {t.accuracy}% הצלחה</span>
            </div>
          ))}
        </div>
      )}

      {d.chats.length > 0 && (
        <div className="card">
          <h3>💬 נושאים ששאלה את איגור</h3>
          <p className="tiny muted" style={{ marginTop: 0 }}>רק הכותרות – תוכן השיחות פרטי שלה 🔒</p>
          {d.chats.map((c, i) => <div key={i} className="small" style={{ padding: '3px 0' }}>{MODE_ICON[c.mode] || '💬'} {c.title}</div>)}
        </div>
      )}

      <div className="card">
        <h3>⚙️ הגדרות עבור {s.name}</h3>
        <label className="lbl">זמן מומלץ ביום (דקות)</label>
        <div className="seg">
          {[20, 30, 40, 60, 0].map((m) => <button key={m} className={(Number(s.profile.dailyLimit) || 0) === m ? 'on' : ''} onClick={() => setSetting({ dailyLimit: m })}>{m || 'ללא'}</button>)}
        </div>
        <label className="lbl">שעת תזכורת יומית</label>
        <input type="time" className="input" defaultValue={s.profile.reminderTime || ''} onBlur={(e) => setSetting({ reminderTime: e.target.value })} />
        <div className="row between mt">
          <span>תוספת זמן במבחני דמה</span>
          <Switch checked={!!s.profile.extraTime} onChange={(v) => setSetting({ extraTime: v })} />
        </div>
        <label className="lbl">איפוס הקוד של {s.name}</label>
        <div className="row">
          <input className="input" inputMode="numeric" placeholder="קוד חדש (4 ספרות)" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
          <button className="btn sm" onClick={async () => { try { await api.post('/api/parent/reset-pin', { newPin }); setNewPin(''); toast('הקוד אופס ✓'); } catch { toast('4 ספרות בבקשה'); } }}>איפוס</button>
        </div>
      </div>

      <div className="card">
        <h3>💡 איך לעזור בלי ללחוץ</h3>
        <ul className="small" style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>
          <li>לשאול "מה איגור לימד אותך היום?" ולתת לה להסביר. להסביר למישהו אחר מחזק את ההבנה.</li>
          <li>לשבח מאמץ והתמדה ("ראיתי שתרגלת 4 ימים!") ולא רק ציונים.</li>
          <li>10–15 דקות ביום עדיפות על "מרתון" לפני מבחן. הרצף חשוב יותר מהכמות.</li>
          <li>לעודד לפתור על דף ולצלם, כדי שיהיה פחות זמן מסך.</li>
          <li>אם יש קושי מתמשך בנושא מסוים, כדאי לשתף את המורה. מסך זה עוזר לזהות אותו מוקדם.</li>
        </ul>
      </div>

      <button className="btn block light" onClick={logout}>יציאה</button>
      <ExamForm open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast('המבחן נוסף ✓ תוכנית ההכנה מוכנה'); load(); }} />
    </>
  );
}

