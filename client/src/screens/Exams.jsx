import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { go, parseHash } from '../router.js';
import { BackBtn, Igor, Loader, MathText, Sheet, Thumbs, TopicSelect, useApp, usePhotoPicker, fmtDate, daysLabel } from '../ui.jsx';
import { findSubtopic } from '../../../shared/curriculum.js';
import { startChat } from './Chat.jsx';

export function ExamForm({ open, onClose, onSaved, startWithPhoto }) {
  const { toast } = useApp();
  const [f, setF] = useState({ title: '', date: '', topicIds: [], notes: '' });
  const [photoIds, setPhotoIds] = useState([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const photos = usePhotoPicker({ kind: 'exam', onUploaded: (l) => extract(l.map((x) => x.id)) });

  const extract = async (ids) => {
    setPhotoIds(ids);
    setReading(true);
    try {
      const { info } = await api.post('/api/exams/extract', { uploadIds: ids });
      setF((x) => ({ title: info.title || x.title, date: info.date || x.date, topicIds: info.topic_ids?.length ? info.topic_ids : x.topicIds, notes: info.notes || x.notes }));
      toast('קראתי את ההודעה ✓ בדקי שהכל נכון');
    } catch {
      toast('לא הצלחתי לקרוא, אפשר למלא ידנית');
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { exam } = await api.post('/api/exams', f);
      onSaved(exam);
    } catch {
      toast('חסר שם, תאריך או נושאים');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="📅 מבחן חדש">
      {photos.input}
      {reading ? <Loader text="קורא את ההודעה על המבחן…" /> : (
        <>
          <button className={`btn block ${startWithPhoto ? '' : 'ghost'}`} onClick={() => photos.pick(false)} disabled={photos.busy}>📸 צלמי את ההודעה / דף הנושאים</button>
          <Thumbs ids={photoIds} />
          <label className="lbl">שם המבחן</label>
          <input className="input" placeholder="למשל: מבחן בגיאומטריה אנליטית" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <label className="lbl">תאריך</label>
          <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <label className="lbl">מה בחומר? ({f.topicIds.length} נבחרו)</label>
          <TopicSelect multiple value={f.topicIds} onChange={(v) => setF({ ...f, topicIds: v })} />
          <label className="lbl">הערות (לא חובה)</label>
          <input className="input" placeholder="דף נוסחאות, מחשבון…" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <button className="btn lg block mt" disabled={saving || !f.title || !f.date || !f.topicIds.length} onClick={save}>{saving ? 'שומר…' : 'שמירה ובניית תוכנית הכנה'}</button>
        </>
      )}
    </Sheet>
  );
}

export function Exams() {
  const { me } = useApp();
  const [data, setData] = useState(null);
  const q = parseHash().query;
  const [adding, setAdding] = useState(!!q.add);
  const [freeMock, setFreeMock] = useState(false);
  const load = () => api.get('/api/exams').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <Loader />;

  const upcoming = data.exams.filter((e) => e.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft);
  const past = data.exams.filter((e) => e.daysLeft < 0);

  return (
    <>
      {me.role === 'student' && <BackBtn onClick={() => go('/more')} />}
      <h1>📝 מבחנים</h1>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={() => setAdding(true)}>+ מבחן חדש</button>
        {me.role === 'student' && <button className="btn ghost grow" onClick={() => setFreeMock(true)}>מבחן דמה חופשי</button>}
      </div>

      <h2>בקרוב</h2>
      {!upcoming.length && <div className="empty"><div className="big">🗓️</div>אין מבחנים קרובים. כשהמורה מודיע/ה על מבחן – תוסיפי אותו ואבנה לך תוכנית הכנה.</div>}
      {upcoming.map((e) => (
        <button key={e.id} className="card tap" onClick={() => go(`/exam/${e.id}`)}>
          <div className="row">
            <div className="center" style={{ minWidth: 56 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)' }}>{e.daysLeft}</div>
              <div className="tiny muted">ימים</div>
            </div>
            <div className="grow">
              <b>{e.title}</b><br />
              <span className="small muted">{fmtDate(e.date)}</span>
              <div className="bar mt"><i style={{ width: `${(e.plan.filter((p) => p.done).length / Math.max(1, e.plan.length)) * 100}%`, background: 'var(--accent)' }} /></div>
            </div>
          </div>
        </button>
      ))}

      {past.length > 0 && (
        <>
          <h2>מבחנים שעברו</h2>
          {past.map((e) => (
            <button key={e.id} className="card tap row" onClick={() => go(`/exam/${e.id}`)}>
              <span className="grow"><b>{e.title}</b><br /><span className="small muted">{fmtDate(e.date)}</span></span>
              {e.grade != null ? <span className="badge good">{e.grade}</span> : <span className="tiny muted">הוסיפי ציון</span>}
            </button>
          ))}
        </>
      )}

      <ExamForm open={adding} startWithPhoto={q.add === 'photo'} onClose={() => setAdding(false)} onSaved={(exam) => { setAdding(false); go(`/exam/${exam.id}`); }} />
      <MockSetup open={freeMock} onClose={() => setFreeMock(false)} />
    </>
  );
}

function MockSetup({ open, onClose, examId, defaultTopics = [] }) {
  const { toast, profile } = useApp();
  const [topics, setTopics] = useState(defaultTopics);
  const [minutes, setMinutes] = useState(45);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const { mock } = await api.post('/api/mock', { examId, topicIds: topics, minutes });
      go(`/mock/${mock.id}`);
    } catch {
      toast('לא הצלחתי להכין מבחן, נסי שוב');
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={busy ? undefined : onClose} title="📝 מבחן דמה">
      {busy ? <Loader text="איגור כותב לך מבחן דמה…" /> : (
        <>
          <p className="small muted" style={{ marginTop: -6 }}>כמו מבחן אמיתי: פותרים על דף, עם טיימר, ובסוף מצלמים לי ואני בודק ונותן ציון ומשוב.{profile.extraTime ? ' (כולל תוספת זמן 25%)' : ''}</p>
          {!examId && (
            <>
              <label className="lbl">נושאים</label>
              <TopicSelect multiple value={topics} onChange={setTopics} />
            </>
          )}
          <label className="lbl">כמה זמן?</label>
          <div className="seg">
            {[20, 45, 90].map((m) => <button key={m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>{m} דק׳</button>)}
          </div>
          <button className="btn lg block mt" disabled={!examId && !topics.length} onClick={start}>יאללה, מתחילים 💪</button>
        </>
      )}
    </Sheet>
  );
}

export function ExamDetail({ id }) {
  const { me, toast } = useApp();
  const [data, setData] = useState(null);
  const [mockOpen, setMockOpen] = useState(false);
  const [grade, setGrade] = useState('');
  const load = () => api.get('/api/exams').then((r) => {
    const e = r.exams.find((x) => String(x.id) === String(id));
    setData({ exam: e, mocks: r.mocks.filter((m) => String(m.exam_id) === String(id)), today: r.today });
    if (e?.grade != null) setGrade(String(e.grade));
  });
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Loader />;
  const { exam, mocks, today } = data;
  if (!exam) return <div className="empty">המבחן לא נמצא<br /><button className="btn mt" onClick={() => go('/exams')}>למבחנים</button></div>;
  const isPast = exam.daysLeft < 0;
  const todayItem = exam.plan.find((p) => p.day === today);

  const toggle = async (day) => {
    await api.patch(`/api/exams/${exam.id}`, { planDay: day });
    load();
  };
  const doItem = (p) => {
    if (p.type === 'mock') setMockOpen(true);
    else if (p.type === 'learn') go(`/lesson/${p.topicId}`);
    else go('/practice', { topic: p.topicId });
  };
  const remove = async () => {
    if (!window.confirm('למחוק את המבחן?')) return;
    await api.del(`/api/exams/${exam.id}`);
    go('/exams');
  };

  return (
    <>
      <BackBtn onClick={() => go(me.role === 'parent' ? '/' : '/exams')} />
      <div className="card" style={{ background: 'var(--accent-soft)', boxShadow: 'none' }}>
        <div className="small muted">{fmtDate(exam.date)}</div>
        <h1 style={{ margin: '4px 0' }}>{exam.title}</h1>
        <div className="bold" style={{ color: 'var(--accent)' }}>{isPast ? 'המבחן עבר' : daysLabel(exam.daysLeft)}</div>
        {exam.notes && <div className="small mt">📌 {exam.notes}</div>}
      </div>

      <h3>החומר למבחן</h3>
      <div className="chips wrap mb">
        {exam.topic_ids.map((t) => <button key={t} className="chip" onClick={() => go(`/topic/${t}`)}>{findSubtopic(t)?.title}</button>)}
      </div>

      {me.role === 'student' && !isPast && (
        <>
          {todayItem && !todayItem.done && (
            <button className="btn lg block mb" onClick={() => doItem(todayItem)}>המשימה להיום: {todayItem.label} 🚀</button>
          )}
          <div className="row mb" style={{ gap: 8 }}>
            <button className="btn ghost grow" onClick={() => setMockOpen(true)}>📝 מבחן דמה</button>
            <button className="btn ghost grow" onClick={() => startChat('exam', { context: `המבחן: ${exam.title} בתאריך ${exam.date}. נושאים: ${exam.topic_ids.map((t) => findSubtopic(t)?.title).join(', ')}`, text: `יש לי ${exam.title} ${daysLabel(exam.daysLeft)}. תעזור לי לחזור על החומר?` })}>💬 חזרה עם איגור</button>
          </div>
        </>
      )}

      {!isPast && (
        <div className="card">
          <h3>תוכנית ההכנה</h3>
          {exam.plan.map((p) => {
            const isToday = p.day === today;
            return (
              <div key={p.day + p.label} className="task" style={isToday ? { background: 'var(--primary-soft)', borderRadius: 12, paddingInline: 8 } : undefined}>
                <button className="tico" style={{ border: 0 }} onClick={() => toggle(p.day)} aria-label="סימון">{p.done ? '✅' : p.type === 'mock' ? '📝' : p.type === 'learn' ? '📖' : '✏️'}</button>
                <span className="grow" role="button" onClick={() => me.role === 'student' && doItem(p)}>
                  <span className="bold" style={p.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{p.label}</span><br />
                  <span className="tiny muted">{isToday ? 'היום' : fmtDate(p.day)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {mocks.length > 0 && (
        <div className="card">
          <h3>מבחני דמה</h3>
          {mocks.map((m) => (
            <button key={m.id} className="list-btn" onClick={() => go(`/mock/${m.id}`)}>
              <span className="grow">{fmtDate(m.started_at.slice(0, 10))}</span>
              {m.score != null ? <span className="badge good">{m.score}</span> : <span className="badge">בתהליך</span>}
            </button>
          ))}
        </div>
      )}

      {isPast && (
        <div className="card">
          <h3>איך היה? מה הציון?</h3>
          <div className="row mt">
            <input className="input" inputMode="numeric" placeholder="ציון" value={grade} onChange={(e) => setGrade(e.target.value)} style={{ maxWidth: 120 }} />
            <button className="btn" onClick={async () => { await api.patch(`/api/exams/${exam.id}`, { grade }); toast('נשמר ✓'); }}>שמירה</button>
          </div>
          <p className="small muted">יש את המבחן הבדוק? צלמי אותו בצ׳אט עם איגור – נעבור ביחד על הטעויות.</p>
          {me.role === 'student' && <button className="btn ghost block" onClick={() => startChat('check', { camera: true, context: `המבחן שהוחזר: ${exam.title}` })}>📸 לעבור על המבחן הבדוק</button>}
        </div>
      )}

      <button className="btn plain block" onClick={remove}>מחיקת המבחן</button>
      <MockSetup open={mockOpen} onClose={() => setMockOpen(false)} examId={exam.id} />
    </>
  );
}

export function MockExam({ id }) {
  const { toast, celebrate } = useApp();
  const [mock, setMock] = useState(null);
  const [answers, setAnswers] = useState({});
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [openSol, setOpenSol] = useState({});
  const activeQ = useRef(null);
  const saveT = useRef(null);
  const photos = usePhotoPicker({
    kind: 'exam',
    onUploaded: (l) => setAnswer(activeQ.current, (a) => ({ ...a, uploadIds: [...(a.uploadIds || []), ...l.map((x) => x.id)] })),
  });

  useEffect(() => {
    api.get(`/api/mock/${id}`).then((r) => { setMock(r.mock); setAnswers(r.mock.answers || {}); }).catch(() => go('/exams'));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [id]);

  function setAnswer(i, fn) {
    setAnswers((prev) => {
      const next = { ...prev, [i]: fn(prev[i] || {}) };
      clearTimeout(saveT.current);
      saveT.current = setTimeout(() => api.post(`/api/mock/${id}/answers`, { answers: next }).catch(() => {}), 800);
      return next;
    });
  }

  if (!mock) return <Loader />;
  if (submitting) return <Loader text="איגור בודק את המבחן… (זה לוקח דקה)" />;

  const finished = !!mock.finished_at;
  const endAt = Date.parse(mock.started_at.replace(' ', 'T') + 'Z') + mock.minutes * 60000;
  const left = Math.max(0, Math.round((endAt - now) / 1000));
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  const submit = async () => {
    if (!window.confirm('להגיש את המבחן לבדיקה?')) return;
    setSubmitting(true);
    try {
      const r = await api.post(`/api/mock/${id}/submit`, { answers });
      setMock(r.mock);
      if (r.mock.score >= 70) celebrate();
    } catch {
      toast('הבדיקה נכשלה, נסי שוב');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 'calc(10px + var(--safe-t)) 16px calc(30px + var(--safe-b))', maxWidth: 720, margin: '0 auto' }}>
      {photos.input}
      <div className="row between" style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 5, padding: '6px 0' }}>
        <button className="back" onClick={() => (mock.exam_id ? go(`/exam/${mock.exam_id}`) : go('/exams'))}>✕</button>
        <b>מבחן דמה</b>
        {finished ? <span className="badge good">ציון: {mock.score}</span> : <span className={`badge ${left < 300 ? 'accent' : ''}`} dir="ltr">⏱ {mm}:{ss}</span>}
      </div>

      {finished ? (
        <div className="card center">
          <Igor size={70} bob />
          <h2 style={{ margin: '8px 0' }}>{mock.score >= 85 ? 'מצוין!! 🌟' : mock.score >= 70 ? 'יפה מאוד! 💪' : mock.score >= 55 ? 'עבר! ויש לנו על מה לעבוד 🙂' : 'זה בדיוק בשביל זה מבחן דמה 💜'}</h2>
          <p className="small muted">הסעיפים שהיה בהם קושי נכנסו למחברת הטעויות. ככה בפעם הבאה הם יהיו קלים.</p>
        </div>
      ) : (
        <div className="card soft small">✏️ פותרים <b>על דף</b>, כמו במבחן אמיתי. בסוף כל שאלה – מצלמים את הפתרון (או כותבים תשובות סופיות). אפשר לצאת ולחזור – התשובות נשמרות.{left === 0 && <><br /><b>⏰ הזמן נגמר! אפשר להגיש.</b></>}</div>
      )}

      {mock.questions.map((q, i) => {
        const a = answers[i] || {};
        const res = mock.results?.[i];
        return (
          <div className="qcard mb" key={i}>
            <div className="row between"><b>שאלה {i + 1}</b><span className="tiny muted">{findSubtopic(q.topic_id)?.title}</span></div>
            <MathText className="mt">{q.intro}</MathText>
            {q.parts.map((p, j) => {
              const pr = res?.parts?.[j];
              return (
                <div key={p.label} className="mt">
                  <div className="row between"><b>{p.label}.</b><span className="tiny muted">{pr ? `${pr.score}/${pr.max}` : `${p.points} נק׳`}</span></div>
                  <MathText>{p.prompt}</MathText>
                  {pr && <div className={`feedback ${pr.score >= pr.max * 0.7 ? 'good' : 'almost'} small`}><MathText>{pr.feedback}</MathText></div>}
                  {finished && p.solution && (
                    openSol[`${i}-${j}`] ? <div className="card soft mt small" style={{ marginBottom: 0 }}><MathText>{p.solution}</MathText></div>
                      : <button className="btn plain sm" onClick={() => setOpenSol((x) => ({ ...x, [`${i}-${j}`]: true }))}>הפתרון 👀</button>
                  )}
                </div>
              );
            })}
            {!finished && (
              <div className="mt">
                <Thumbs ids={a.uploadIds} onRemove={(u) => setAnswer(i, (x) => ({ ...x, uploadIds: x.uploadIds.filter((y) => y !== u) }))} />
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost sm" onClick={() => { activeQ.current = i; photos.pick(false); }} disabled={photos.busy}>📸 צילום הפתרון</button>
                </div>
                <textarea className="textarea mt" rows={2} placeholder="או כתבי את התשובות הסופיות (א: …, ב: …)" value={a.text || ''} onChange={(e) => setAnswer(i, (x) => ({ ...x, text: e.target.value }))} />
              </div>
            )}
            {res?.summary && <div className="small muted mt">💬 {res.summary}</div>}
          </div>
        );
      })}

      {!finished ? (
        <button className="btn lg block" onClick={submit}>הגשה לבדיקה ✓</button>
      ) : (
        <div className="col">
          <button className="btn lg block" onClick={() => go('/practice', { purpose: 'review' })}>🔁 לחזור על הטעויות</button>
          <button className="btn ghost block" onClick={() => go(mock.exam_id ? `/exam/${mock.exam_id}` : '/exams')}>סיום</button>
        </div>
      )}
    </div>
  );
}
