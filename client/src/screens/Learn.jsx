import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { go } from '../router.js';
import { BackBtn, Loader, Ring, useApp } from '../ui.jsx';
import { UNITS, findSubtopic, findUnit } from '../../../shared/curriculum.js';
import { startChat } from './Chat.jsx';

const GRAPH_TOPICS = { linear: 'linear', quadratic: 'quadratic', parabolaline: 'quadratic', funcprops: 'quadratic', power: 'custom', transform: 'quadratic', absval: 'custom', slope: 'linear', lineeq: 'linear', parperp: 'linear', intersect: 'linear', derivdef: 'custom', tangent: 'custom', extrema: 'custom' };

function scoreLabel(s) {
  if (s === null || s === undefined) return 'עוד לא תרגלנו';
  if (s >= 80) return 'שולטת! 🌟';
  if (s >= 55) return 'בדרך הנכונה';
  if (s >= 25) return 'צריך עוד קצת';
  return 'מתחילות';
}

export function Learn() {
  const { profile } = useApp();
  const [units, setUnits] = useState(null);
  const [open, setOpen] = useState(() => findSubtopic(profile.currentTopic)?.unitId || null);

  useEffect(() => { api.get('/api/progress').then((r) => setUnits(r.units)); }, []);
  if (!units) return <Loader />;
  const current = findSubtopic(profile.currentTopic);

  return (
    <>
      <h1>📚 החומר של כיתה י׳</h1>
      <p className="muted small" style={{ marginTop: -6 }}>4 יחידות · שאלון 471 · התוכנית החדשה</p>

      {current && (
        <button className="card tap row soft" onClick={() => go(`/topic/${current.id}`)}>
          <span style={{ fontSize: 28 }}>📍</span>
          <span className="grow"><span className="small muted">לומדים עכשיו בכיתה</span><br /><b>{current.title}</b></span>
          <span className="muted">←</span>
        </button>
      )}

      {units.map((u) => {
        const unit = findUnit(u.id);
        const isOpen = open === u.id;
        return (
          <div key={u.id} className="card">
            <button className="unit" style={{ background: 'none', border: 0, width: '100%', padding: 0, textAlign: 'start' }} onClick={() => setOpen(isOpen ? null : u.id)} aria-expanded={isOpen}>
              <span className="uico" style={{ background: `color-mix(in srgb, ${u.color} 16%, transparent)` }}>{u.emoji}</span>
              <span className="grow">
                <b>{u.title}</b><br />
                <span className="tiny muted">{unit.when} · {u.practiced}/{u.total} נושאים</span>
              </span>
              <Ring value={u.score} color={u.color} />
            </button>
            {isOpen && (
              <div className="mt">
                <p className="small muted" style={{ marginTop: 0 }}>{unit.description}</p>
                {u.subtopics.map((s) => (
                  <button key={s.id} className="sub" style={{ background: 'none', borderInline: 0, borderTop: 0, width: '100%', textAlign: 'start' }} onClick={() => go(`/topic/${s.id}`)}>
                    <span className="grow">
                      <b>{s.title}</b> {profile.currentTopic === s.id && <span className="badge accent">בכיתה עכשיו</span>}<br />
                      <span className="tiny muted">{scoreLabel(s.score)}</span>
                    </span>
                    <div className="bar" style={{ width: 70 }}><i style={{ width: `${s.score || 0}%`, background: u.color }} /></div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="tiny muted center">סדר הנושאים לפי המלצות משרד החינוך. אם המורה מלמד בסדר אחר – סמני "לומדים עכשיו" בנושא המתאים.</p>
    </>
  );
}

export function Topic({ id }) {
  const { profile, updateProfile, toast } = useApp();
  const t = findSubtopic(id);
  const [info, setInfo] = useState(null);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    api.get('/api/progress').then((r) => setInfo(r.units.flatMap((u) => u.subtopics).find((s) => s.id === id)));
    api.get('/api/notes').then((r) => setNotes(r.notes.filter((n) => n.topic_id === id)));
    api.post('/api/practice/prefetch', { topicId: id }).catch(() => {});
  }, [id]);

  if (!t) return <div className="empty">נושא לא נמצא</div>;
  const isCurrent = profile.currentTopic === id;

  return (
    <>
      <BackBtn onClick={() => go('/learn')} label="כל הנושאים" />
      <div className="row mt">
        <span className="uico" style={{ width: 54, height: 54, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, background: `color-mix(in srgb, ${t.color} 16%, transparent)` }}>{t.emoji}</span>
        <div className="grow">
          <div className="tiny muted">{t.unitTitle}</div>
          <h1 style={{ margin: 0 }}>{t.title}</h1>
        </div>
        <Ring value={info?.score || 0} color={t.color} size={54} />
      </div>
      <p className="small muted">{scoreLabel(info?.score)}{info?.attempts ? ` · ${info.attempts} תרגילים` : ''}</p>

      <div className="col">
        <button className="btn lg block" onClick={() => go(`/lesson/${id}`)}>📖 שיעור קצר (5 דק׳)</button>
        <button className="btn lg block ghost" onClick={() => go('/practice', { topic: id })}>✏️ תרגול</button>
        <button className="btn block light" onClick={() => startChat('topic', { topicId: id, text: `תסביר לי את הנושא "${t.title}" מההתחלה, בפשטות` })}>💬 שאלי את איגור על הנושא</button>
        {GRAPH_TOPICS[id] && <button className="btn block light" onClick={() => go('/graph', { mode: GRAPH_TOPICS[id] })}>📈 לשחק עם גרף</button>}
      </div>

      <div className="card mt">
        <h3>מה צריך לדעת</h3>
        <ul className="small" style={{ margin: '6px 0 0', paddingInlineStart: 20 }}>
          {t.skills.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </div>

      {notes.length > 0 && (
        <div className="card">
          <h3>📓 מהשיעורים בכיתה</h3>
          {notes.map((n) => (
            <button key={n.id} className="list-btn" onClick={() => go(`/note/${n.id}`)}>
              <span className="grow">{n.title}</span>
              <span className="tiny muted">{n.lesson_date}</span>
            </button>
          ))}
        </div>
      )}

      <button className="btn block plain" onClick={async () => { await updateProfile({ currentTopic: isCurrent ? null : id }); toast(isCurrent ? 'הוסר' : 'מעולה! אתמקד בזה 📍'); }}>
        {isCurrent ? '✓ זה מה שלומדים עכשיו בכיתה (לחצי לביטול)' : '📍 סמני: זה מה שלומדים עכשיו בכיתה'}
      </button>
    </>
  );
}
