import { useEffect, useState } from 'react';
import { api, uploadUrl } from '../api.js';
import { go, parseHash } from '../router.js';
import { BackBtn, Loader, MathText, Sheet, Thumbs, TopicSelect, useApp, usePhotoPicker, fmtDate } from '../ui.jsx';
import { findSubtopic } from '../../../shared/curriculum.js';
import { startChat } from './Chat.jsx';

function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

export function Notes() {
  const { toast, celebrate } = useApp();
  const [notes, setNotes] = useState(null);
  const [adding, setAdding] = useState(!!parseHash().query.add);
  const [ids, setIds] = useState([]);
  const [hint, setHint] = useState('');
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const photos = usePhotoPicker({ kind: 'note', onUploaded: (l) => setIds((x) => [...x, ...l.map((y) => y.id)]) });

  useEffect(() => { api.get('/api/notes').then((r) => setNotes(r.notes)); }, []);

  const analyze = async () => {
    setBusy(true);
    try {
      const { note } = await api.post('/api/notes', { uploadIds: ids, hint, lessonDate: date });
      celebrate();
      go(`/note/${note.id}`);
    } catch {
      toast('לא הצלחתי לנתח את הצילומים, נסי שוב');
      setBusy(false);
    }
  };

  return (
    <>
      <BackBtn onClick={() => go('/more')} />
      <h1>📓 מחברת הכיתה</h1>
      <p className="muted small" style={{ marginTop: -6 }}>מצלמים את המחברת, הלוח או דף העבודה – ואיגור מסכם, מתאים את עצמו לשיטה של המורה ומכין תרגול על מה שלמדתם.</p>
      <button className="btn lg block mb" onClick={() => setAdding(true)}>📸 הוספת שיעור</button>

      {!notes ? <Loader /> : !notes.length ? (
        <div className="empty"><div className="big">📓</div>עוד אין שיעורים שמורים. אחרי השיעור הבא – צלמי את המחברת!</div>
      ) : notes.map((n) => (
        <button key={n.id} className="card tap row" onClick={() => go(`/note/${n.id}`)}>
          {n.upload_ids[0] && <img src={uploadUrl(n.upload_ids[0])} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 12 }} />}
          <span className="grow">
            <b>{n.title}</b><br />
            <span className="tiny muted">{fmtDate(n.lesson_date || n.created_at.slice(0, 10))}{n.topic_id ? ` · ${findSubtopic(n.topic_id)?.title}` : ''}</span>
          </span>
        </button>
      ))}

      <Sheet open={adding} onClose={busy ? undefined : () => setAdding(false)} title="שיעור חדש 📓">
        {photos.input}
        {busy ? <Loader text="איגור קורא את המחברת ומסכם…" /> : (
          <>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn grow" onClick={() => photos.pick(true)} disabled={photos.busy}>📷 צילום</button>
              <button className="btn ghost grow" onClick={() => photos.pick(false)} disabled={photos.busy}>🖼️ מהגלריה</button>
            </div>
            {photos.busy && <p className="small muted center">מעלה…</p>}
            <Thumbs ids={ids} onRemove={(u) => setIds((x) => x.filter((y) => y !== u))} />
            <p className="tiny muted">אפשר כמה צילומים (עד 8). טיפ: צלמי ישר מלמעלה, באור טוב.</p>
            <label className="lbl">תאריך השיעור</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <label className="lbl">משהו להוסיף? (לא חובה)</label>
            <input className="input" placeholder="למשל: לא הבנתי את הסוף" value={hint} onChange={(e) => setHint(e.target.value)} />
            <button className="btn lg block mt" disabled={!ids.length} onClick={analyze}>✨ סכם לי את השיעור</button>
          </>
        )}
      </Sheet>
    </>
  );
}

export function NoteDetail({ id }) {
  const { toast } = useApp();
  const [note, setNote] = useState(null);
  useEffect(() => { api.get(`/api/notes/${id}`).then((r) => setNote(r.note)).catch(() => go('/notes')); }, [id]);
  if (!note) return <Loader />;
  const t = findSubtopic(note.topic_id);

  const setTopic = async (topicId) => {
    await api.patch(`/api/notes/${id}`, { topicId });
    setNote({ ...note, topic_id: topicId });
    toast('עודכן ✓');
  };
  const remove = async () => {
    if (!window.confirm('למחוק את השיעור?')) return;
    await api.del(`/api/notes/${id}`);
    go('/notes');
  };

  return (
    <>
      <BackBtn onClick={() => go('/notes')} label="מחברת הכיתה" />
      <h1>{note.title}</h1>
      <div className="small muted mb">{fmtDate(note.lesson_date || note.created_at.slice(0, 10))}</div>

      <div className="col mb">
        {t && <button className="btn lg block" onClick={() => go('/practice', { topic: t.id })}>✏️ תרגול על השיעור</button>}
        <button className="btn block ghost" onClick={() => startChat('note', { topicId: note.topic_id, context: `סיכום השיעור:\n${note.summary}\n\nסימונים של המורה: ${note.notation}`, text: 'יש לי שאלה על השיעור הזה:' })}>💬 שאלה על השיעור</button>
      </div>

      <div className="card">
        <h3>✨ הסיכום של איגור</h3>
        <MathText className="mt">{note.summary}</MathText>
      </div>

      {note.notation && (
        <div className="card soft">
          <h3>✍️ איך המורה כותב/ת את זה</h3>
          <MathText>{note.notation}</MathText>
          <p className="tiny muted" style={{ marginBottom: 0 }}>איגור ישתמש באותם סימונים בהסברים שלו</p>
        </div>
      )}

      <div className="card">
        <h3>📷 הצילומים</h3>
        <div className="photo-grid mt">
          {note.upload_ids.map((u) => <a key={u} href={uploadUrl(u)} target="_blank" rel="noreferrer"><img src={uploadUrl(u)} alt="צילום מהשיעור" /></a>)}
        </div>
      </div>

      <label className="lbl">הנושא בתוכנית</label>
      <TopicSelect value={note.topic_id} onChange={setTopic} placeholder="אחר / לא בטוח" />
      <button className="btn plain block mt" onClick={remove}>מחיקת השיעור</button>
    </>
  );
}
