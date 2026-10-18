import { useEffect, useRef, useState } from 'react';
import { api, streamMessage, uploadUrl } from '../api.js';
import { go } from '../router.js';
import { Igor, Loader, MathText, Thumbs, speak, useApp, useDictation, usePhotoPicker } from '../ui.jsx';
import MathKeyboard from '../MathKeyboard.jsx';

const MODE_META = {
  chat: { icon: '💬', title: 'שאלה לאיגור' },
  homework: { icon: '📝', title: 'שיעורי בית' },
  check: { icon: '✅', title: 'בדיקת פתרון' },
  topic: { icon: '📖', title: 'הסבר נושא' },
  mistake: { icon: '🔁', title: 'מתקנים טעות' },
  practice: { icon: '✏️', title: 'עזרה בתרגיל' },
  exam: { icon: '📅', title: 'הכנה למבחן' },
  note: { icon: '📓', title: 'על השיעור' },
};

/** פותח שיחה חדשה ועובר אליה. text = הודעה שתישלח אוטומטית. */
export async function startChat(mode, { topicId, context, text, title, camera } = {}) {
  const { conversation } = await api.post('/api/conversations', { mode, topicId, context, title: title || undefined });
  sessionStorage.setItem(`igor:intent:${conversation.id}`, JSON.stringify({ text, camera }));
  go(`/chat/${conversation.id}`);
}

export function ChatList() {
  const [list, setList] = useState(null);
  useEffect(() => { api.get('/api/conversations').then((r) => setList(r.conversations)); }, []);
  const remove = async (id) => {
    await api.del(`/api/conversations/${id}`);
    setList((l) => l.filter((c) => c.id !== id));
  };
  return (
    <>
      <div className="hero">
        <Igor size={56} bob />
        <div className="grow"><h1>איגור</h1><div className="muted small">שואלים, מצלמים, מבינים</div></div>
      </div>
      <div className="quick">
        <button onClick={() => startChat('chat')}><span className="q-ico">💬</span><b>שאלה חדשה</b><span>על כל דבר במתמטיקה</span></button>
        <button onClick={() => startChat('homework', { camera: true })}><span className="q-ico">📸</span><b>שיעורי בית</b><span>צלמי ונפתור ביחד</span></button>
        <button onClick={() => startChat('check', { camera: true })}><span className="q-ico">✅</span><b>בדיקת פתרון</b><span>איפה הטעות?</span></button>
        <button onClick={() => startChat('exam')}><span className="q-ico">📅</span><b>הכנה למבחן</b><span>חזרה ממוקדת</span></button>
      </div>
      <h2>שיחות קודמות</h2>
      {!list ? <Loader /> : !list.length ? (
        <div className="empty"><div className="big">🦉</div>עוד אין שיחות. תשאלי אותי משהו!</div>
      ) : (
        <div className="card" style={{ padding: '4px 16px' }}>
          {list.map((c) => (
            <div key={c.id} className="list-btn" role="button" onClick={() => go(`/chat/${c.id}`)}>
              <span className="li-ico">{MODE_META[c.mode]?.icon || '💬'}</span>
              <span className="grow">
                <span className="bold">{c.title}</span><br />
                <span className="tiny muted">{MODE_META[c.mode]?.title} · {new Date(c.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}</span>
              </span>
              <button className="btn plain sm" onClick={(e) => { e.stopPropagation(); remove(c.id); }} aria-label="מחיקה">🗑️</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const QUICK_REPLIES = [
  { label: '💡 רמז', text: 'אפשר רמז קטן?' },
  { label: '👣 הצעד הבא', text: 'תראה לי רק את הצעד הבא' },
  { label: '🤔 לא הבנתי', text: 'לא הבנתי, אפשר להסביר אחרת?' },
  { label: '🙌 הבנתי!', text: 'הבנתי! 🙌' },
  { label: '✏️ תרגיל דומה', text: 'תן לי תרגיל דומה לתרגל' },
  { label: '🎯 פתרון מלא', text: 'ניסיתי, אפשר לראות את הפתרון המלא צעד-צעד?' },
];

const STARTERS = {
  chat: ['לא הבנתי את השיעור היום 😩', 'מה זה בעצם שיפוע?', 'איך פותרים משוואה ריבועית?', 'למה צריך את כל זה בחיים? 😅'],
  exam: ['יש לי מבחן בקרוב, עזור לי לחזור', 'תן לי טיפים למבחן', 'אני לחוצה מהמבחן'],
};

const INTRO = {
  chat: 'היי! 👋 על מה בא לך לדבר? אפשר לכתוב, להקליט או לצלם.',
  homework: 'שלחי לי צילום של שיעורי הבית (או תכתבי את התרגיל) – ונפתור ביחד, צעד אחרי צעד 📝',
  check: 'צלמי את הפתרון שכתבת – אני אבדוק ואעזור לך למצוא אם יש טעות 🔎',
  exam: 'בואי נתכונן! על איזה מבחן מדובר ומה החומר?',
};

export function Conversation({ id }) {
  const { profile, toast } = useApp();
  const [convo, setConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [uploads, setUploads] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [kb, setKb] = useState(false);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const intentRef = useRef(null);

  const photos = usePhotoPicker({ kind: 'chat', onUploaded: (list) => setUploads((u) => [...u, ...list.map((x) => x.id)]) });
  const dictation = useDictation((t) => setText((x) => (x ? x + ' ' : '') + t));

  useEffect(() => {
    api.get(`/api/conversations/${id}`).then((r) => {
      setConvo(r.conversation);
      setMessages(r.messages);
      const raw = sessionStorage.getItem(`igor:intent:${id}`);
      if (raw) {
        sessionStorage.removeItem(`igor:intent:${id}`);
        intentRef.current = JSON.parse(raw);
        if (intentRef.current.text && !r.messages.length) send(intentRef.current.text, []);
      }
    }).catch(() => go('/chat'));
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  async function send(msgText = text, ids = uploads) {
    const t = msgText.trim();
    if ((!t && !ids.length) || streaming) return;
    setText('');
    setUploads([]);
    setKb(false);
    const userMsg = { id: `u${Date.now()}`, role: 'user', text: t, upload_ids: ids };
    const igorMsg = { id: `a${Date.now()}`, role: 'assistant', text: '', pending: true };
    setMessages((m) => [...m, userMsg, igorMsg]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await streamMessage(id, { text: t, uploadIds: ids }, {
        signal: ctrl.signal,
        onDelta: (d) => setMessages((m) => m.map((x) => (x.id === igorMsg.id ? { ...x, text: x.text + d, pending: false } : x))),
      });
      if (res.error) setMessages((m) => m.map((x) => (x.id === igorMsg.id ? { ...x, text: x.text || res.error, pending: false, error: true } : x)));
      if (res.title) setConvo((c) => ({ ...c, title: res.title }));
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages((m) => m.map((x) => (x.id === igorMsg.id ? { ...x, text: 'אופס, אין חיבור כרגע 😕 נסי שוב.', pending: false, error: true } : x)));
      }
    } finally {
      setStreaming(false);
    }
  }

  if (!convo) return <Loader />;
  const meta = MODE_META[convo.mode] || MODE_META.chat;
  const lastIgor = [...messages].reverse().find((m) => m.role === 'assistant');
  const showQuick = !streaming && lastIgor && !lastIgor.error && messages.length >= 2;
  const showPhotoCTA = !messages.length && (convo.mode === 'homework' || convo.mode === 'check');

  return (
    <div className="chat">
      <div className="chat-head">
        <button className="back" onClick={() => go('/chat')}>→</button>
        <Igor size={38} />
        <div className="grow">
          <div className="bold" style={{ lineHeight: 1.2 }}>{convo.title === 'שיחה חדשה' ? meta.title : convo.title}</div>
          <div className="tiny muted">{streaming ? 'איגור מקליד…' : `${meta.icon} ${meta.title}`}</div>
        </div>
      </div>

      <div className="chat-body" ref={bodyRef}>
        {!messages.length && (
          <div className="msg igor"><MathText>{INTRO[convo.mode] || 'היי! 👋 במה נתחיל?'}</MathText></div>
        )}
        {showPhotoCTA && (
          <div className="col" style={{ alignSelf: 'stretch', marginTop: 6 }}>
            <button className="btn lg block" onClick={() => photos.pick(true)} disabled={photos.busy}>📷 {photos.busy ? 'מעלה…' : 'לצלם עכשיו'}</button>
            <button className="btn ghost block" onClick={() => photos.pick(false)} disabled={photos.busy}>🖼️ לבחור מהגלריה</button>
          </div>
        )}
        {!messages.length && STARTERS[convo.mode] && (
          <div className="chips wrap" style={{ marginTop: 4 }}>
            {STARTERS[convo.mode].map((s) => <button key={s} className="chip" onClick={() => send(s, [])}>{s}</button>)}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'me' : 'igor'}`}>
            {!!m.upload_ids?.length && (
              <div className="imgs">{m.upload_ids.map((u) => <a key={u} href={uploadUrl(u)} target="_blank" rel="noreferrer"><img src={uploadUrl(u)} alt="צילום" /></a>)}</div>
            )}
            {m.pending ? <div className="typing"><span /><span /><span /></div> : m.text && <MathText>{m.text}</MathText>}
            {m.role === 'assistant' && !m.pending && profile.voice !== false && (
              <div className="msg-tools">
                <button onClick={() => speak(m.text) || toast('הקראה לא נתמכת במכשיר הזה')} aria-label="הקראה">🔊</button>
              </div>
            )}
          </div>
        ))}
        {showQuick && (
          <div className="chips" style={{ marginTop: 2 }}>
            {QUICK_REPLIES.map((q) => <button key={q.label} className="chip" onClick={() => send(q.text, [])}>{q.label}</button>)}
          </div>
        )}
      </div>

      <div className="composer">
        {photos.input}
        <Thumbs ids={uploads} onRemove={(u) => setUploads((x) => x.filter((y) => y !== u))} />
        {kb && <MathKeyboard targetRef={inputRef} setValue={setText} onClose={() => setKb(false)} />}
        <div className="bar-row">
          <button className="icon-btn" onClick={() => photos.pick(false)} disabled={photos.busy} aria-label="צילום">{photos.busy ? '⏳' : '📷'}</button>
          <button className="icon-btn" onClick={() => setKb((k) => !k)} aria-label="מקלדת מתמטית" style={kb ? { background: 'var(--primary)', color: 'var(--on-primary)' } : undefined}>∑</button>
          <textarea
            ref={inputRef}
            className="textarea grow"
            rows={1}
            placeholder={uploads.length ? 'רוצה להוסיף משהו? (לא חובה)' : 'כתבי לאיגור…'}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault();
                send();
              }
            }}
          />
          {dictation.supported && !text && !uploads.length ? (
            <button className={`icon-btn${dictation.listening ? ' rec' : ''}`} onClick={dictation.toggle} aria-label="הקלטה">🎤</button>
          ) : (
            <button className="icon-btn send" onClick={() => send()} disabled={streaming || (!text.trim() && !uploads.length)} aria-label="שליחה">↑</button>
          )}
        </div>
      </div>
    </div>
  );
}
