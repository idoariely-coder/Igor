import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { go } from '../router.js';
import { BackBtn, Loader, MathText, useApp } from '../ui.jsx';
import { findSubtopic } from '../../../shared/curriculum.js';
import { startChat } from './Chat.jsx';

const BOX_LABEL = ['חדש', 'חזרה 1', 'חזרה 2', 'חזרה 3', 'כמעט שם!'];

export default function Mistakes() {
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => api.get('/api/mistakes').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <Loader />;

  const due = data.open.filter((m) => m.due_at <= data.today);
  const later = data.open.filter((m) => m.due_at > data.today);

  const resolve = async (id) => {
    await api.post(`/api/mistakes/${id}/resolve`);
    toast('יופי! הוצאתי מהמחברת ✓');
    load();
  };

  const Item = ({ m }) => {
    const t = findSubtopic(m.topic_id);
    const isOpen = open === m.id;
    return (
      <div className="card">
        <button style={{ background: 'none', border: 0, padding: 0, width: '100%', textAlign: 'start' }} onClick={() => setOpen(isOpen ? null : m.id)}>
          <div className="row between">
            <span className="tiny muted">{t?.title}</span>
            <span className="badge">{BOX_LABEL[m.box] || 'חזרה'}</span>
          </div>
          <MathText className="mt">{m.question.prompt}</MathText>
        </button>
        {isOpen && (
          <div className="mt">
            {m.wrong_answer && <div className="small muted">עניתי: <span dir="ltr">{m.wrong_answer}</span></div>}
            <div className="card soft mt" style={{ marginBottom: 10 }}>
              <div className="small bold">הפתרון:</div>
              <MathText>{m.question.solution}</MathText>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn sm" onClick={() => startChat('mistake', { topicId: m.topic_id, context: `התרגיל: ${m.question.prompt}\nתשובה נכונה: ${m.question.answer}\nפתרון: ${m.question.solution}\nהיא ענתה: ${m.wrong_answer || '(לא ענתה)'}`, text: `תעזור לי להבין איפה טעיתי בתרגיל הזה?\n\n${m.question.prompt}` })}>💬 למה טעיתי?</button>
              <button className="btn ghost sm" onClick={() => resolve(m.id)}>✓ הבנתי, אפשר להוציא</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <BackBtn onClick={() => go('/more')} />
      <h1>🔁 מחברת הטעויות</h1>
      <p className="muted small" style={{ marginTop: -6 }}>כל טעות היא הזדמנות. כל תרגיל חוזר אחרי יום, 3 ימים, שבוע ושבועיים – עד שהוא נעלם.</p>
      <div className="stat-row">
        <div className="stat"><b>{due.length}</b><span>לחזרה היום</span></div>
        <div className="stat"><b>{later.length}</b><span>מחכים בתור</span></div>
        <div className="stat"><b>{data.resolved}</b><span>כבר הבנתי ✓</span></div>
      </div>
      {due.length > 0 && <button className="btn lg block mb" onClick={() => go('/practice', { purpose: 'review' })}>חזרה חכמה עכשיו ({due.length}) 🚀</button>}
      {!data.open.length && <div className="empty"><div className="big">✨</div>המחברת ריקה! כשתטעי בתרגיל – הוא יגיע לפה כדי שנחזור עליו.</div>}
      {due.length > 0 && <h2>להיום</h2>}
      {due.map((m) => <Item key={m.id} m={m} />)}
      {later.length > 0 && <h2>בהמשך</h2>}
      {later.map((m) => <Item key={m.id} m={m} />)}
    </>
  );
}
