import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { go } from '../router.js';
import { AVATARS, Igor, TopicSelect, useApp } from '../ui.jsx';

function PinPad({ value, onChange, length = 4 }) {
  const press = (d) => value.length < length && onChange(value + d);
  return (
    <>
      <div className="pin-dots">{Array.from({ length }, (_, i) => <i key={i} className={i < value.length ? 'on' : ''} />)}</div>
      <div className="pinpad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => <button key={d} onClick={() => press(String(d))}>{d}</button>)}
        <span />
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => onChange(value.slice(0, -1))} aria-label="מחיקה">⌫</button>
      </div>
    </>
  );
}

export function Setup({ onDone }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ studentName: '', studentPin: '', parentName: '', parentPin: '' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    try {
      await api.post('/api/setup', f);
      onDone();
    } catch {
      setErr('משהו לא עבד. בדקו שהקודים הם 4 ספרות.');
    }
  };

  return (
    <div className="main" style={{ maxWidth: 480 }}>
      <div className="center" style={{ marginTop: 30 }}>
        <Igor size={96} bob avatar="🦉" />
        {step === 0 && (
          <>
            <h1>ברוכים הבאים לאיגור</h1>
            <p className="muted">המורה הפרטי למתמטיקה, כל יום ולאורך כל השנה. ההגדרה הראשונית לוקחת דקה.</p>
            <button className="btn block lg mt" onClick={() => setStep(1)}>יאללה, מתחילים</button>
          </>
        )}
        {step === 1 && (
          <>
            <h1>איך קוראים לתלמידה?</h1>
            <input className="input center" autoFocus placeholder="שם" value={f.studentName} onChange={(e) => set('studentName', e.target.value)} />
            <button className="btn block mt" disabled={!f.studentName.trim()} onClick={() => setStep(2)}>המשך</button>
          </>
        )}
        {step === 2 && (
          <>
            <h1>קוד סודי ל{f.studentName}</h1>
            <p className="muted small">4 ספרות – בשביל הכניסה לאפליקציה</p>
            <PinPad value={f.studentPin} onChange={(v) => set('studentPin', v)} />
            <button className="btn block mt" disabled={f.studentPin.length !== 4} onClick={() => setStep(3)}>המשך</button>
          </>
        )}
        {step === 3 && (
          <>
            <h1>עכשיו ההורה 👋</h1>
            <p className="muted small">להורה יש תצוגה נפרדת: התקדמות, מבחנים וסיכום שבועי (בלי לקרוא את השיחות שלה)</p>
            <input className="input center" placeholder="השם שלך (למשל: אבא / אמא)" value={f.parentName} onChange={(e) => set('parentName', e.target.value)} />
            <button className="btn block mt" disabled={!f.parentName.trim()} onClick={() => setStep(4)}>המשך</button>
          </>
        )}
        {step === 4 && (
          <>
            <h1>קוד להורה</h1>
            <p className="muted small">קוד שונה מהקוד של התלמידה</p>
            <PinPad value={f.parentPin} onChange={(v) => set('parentPin', v)} />
            {err && <p style={{ color: 'var(--accent)' }}>{err}</p>}
            <button className="btn block mt" disabled={f.parentPin.length !== 4} onClick={submit}>סיום</button>
          </>
        )}
        {step > 0 && <button className="btn plain mt" onClick={() => setStep(step - 1)}>חזרה</button>}
      </div>
    </div>
  );
}

export function Login({ users, onDone }) {
  const [user, setUser] = useState(users.length === 1 ? users[0] : null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (pin.length !== 4 || !user) return;
    api.post('/api/login', { userId: user.id, pin })
      .then(() => onDone())
      .catch((e) => {
        setErr(e.status === 429 ? `יותר מדי ניסיונות. נסי שוב בעוד ${e.body?.wait || 60} שניות` : 'קוד לא נכון, נסי שוב');
        setPin('');
      });
  }, [pin, user, onDone]);

  return (
    <div className="main" style={{ maxWidth: 480 }}>
      <div className="center" style={{ marginTop: 40 }}>
        {!user ? (
          <>
            <Igor size={96} bob avatar="🦉" />
            <h1>מי נכנס/ת?</h1>
            <div className="col mt">
              {users.map((u) => (
                <button key={u.id} className="card tap row" onClick={() => setUser(u)}>
                  <Igor size={44} avatar={u.role === 'student' ? u.avatar || '🦉' : '👤'} />
                  <span className="grow bold">{u.name}</span>
                  <span className="muted small">{u.role === 'student' ? 'תלמידה' : 'הורה'}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Igor size={80} bob avatar={user.role === 'student' ? user.avatar || '🦉' : '👤'} />
            <h1>היי {user.name}!</h1>
            <p className="muted">הקלידי את הקוד</p>
            <PinPad value={pin} onChange={(v) => { setErr(''); setPin(v); }} />
            {err && <p style={{ color: 'var(--accent)' }}>{err}</p>}
            {users.length > 1 && <button className="btn plain mt" onClick={() => { setUser(null); setPin(''); }}>זה לא אני</button>}
          </>
        )}
      </div>
    </div>
  );
}

const INTEREST_OPTIONS = ['🎵 מוזיקה', '💃 ריקוד', '⚽ כדורגל', '🏀 כדורסל', '🎨 ציור ועיצוב', '👗 אופנה', '📱 טיקטוק ורשתות', '🎮 גיימינג', '🍰 אפייה ובישול', '🐶 חיות', '🎬 סדרות וסרטים', '✈️ טיולים', '🏊 שחייה', '📚 קריאה', '🧪 מדע'];

export function Onboarding() {
  const { me, updateProfile } = useApp();
  const [step, setStep] = useState(0);
  const [avatar, setAvatar] = useState('🦉');
  const [interests, setInterests] = useState([]);
  const [freeInterest, setFreeInterest] = useState('');
  const [currentTopic, setCurrentTopic] = useState(null);
  const [reminder, setReminder] = useState('17:00');

  const finish = async (thenDiagnostic) => {
    const all = [...interests.map((i) => i.replace(/^\S+\s/, '')), freeInterest.trim()].filter(Boolean).join(', ');
    await updateProfile({ avatar, interests: all, currentTopic, reminderTime: reminder, onboarded: true, focusMinutes: 15, dailyLimit: 40, voice: true });
    go(thenDiagnostic ? '/practice' : '/', thenDiagnostic ? { purpose: 'diagnostic' } : undefined);
  };

  const Next = ({ disabled, label = 'המשך' }) => <button className="btn block lg mt" disabled={disabled} onClick={() => setStep(step + 1)}>{label}</button>;

  return (
    <div className="main" style={{ maxWidth: 520 }}>
      <div className="progress-dots" style={{ marginTop: 10 }}>{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      <div className="center">
        {step === 0 && (
          <>
            <Igor size={110} bob avatar={avatar} />
            <h1>היי {me.name}! אני איגור 👋</h1>
            <p>אני המורה הפרטי שלך למתמטיקה. אני פה כל יום – לשיעורי בית, לתרגול, למבחנים ולכל שאלה. <b>אין שאלות טיפשיות</b>, ואני אף פעם לא מתעצבן 😄</p>
            <Next label="נעים מאוד!" />
          </>
        )}
        {step === 1 && (
          <>
            <Igor size={110} bob avatar={avatar} />
            <h1>איך אני נראה?</h1>
            <p className="muted">תבחרי את הדמות שלי – אפשר להחליף תמיד בהגדרות</p>
            <div className="chips wrap" style={{ justifyContent: 'center', gap: 12 }}>
              {AVATARS.map((a) => (
                <button key={a} onClick={() => setAvatar(a)} className={`chip${avatar === a ? ' on' : ''}`} style={{ fontSize: 30, padding: '8px 14px' }}>{a}</button>
              ))}
            </div>
            <Next />
          </>
        )}
        {step === 2 && (
          <>
            <h1>מה את אוהבת? 💜</h1>
            <p className="muted">ככה הדוגמאות שלי יהיו מהעולם שלך</p>
            <div className="chips wrap" style={{ justifyContent: 'center' }}>
              {INTEREST_OPTIONS.map((i) => (
                <button key={i} className={`chip${interests.includes(i) ? ' on' : ''}`} onClick={() => setInterests((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>{i}</button>
              ))}
            </div>
            <input className="input mt" placeholder="עוד משהו? (למשל: טיילור סוויפט, כדורעף)" value={freeInterest} onChange={(e) => setFreeInterest(e.target.value)} />
            <Next />
          </>
        )}
        {step === 3 && (
          <>
            <h1>מה לומדים עכשיו בכיתה?</h1>
            <p className="muted">ככה אדע במה להתמקד. לא בטוחה? אפשר לדלג ולצלם לי את המחברת אחר כך</p>
            <TopicSelect value={currentTopic} onChange={setCurrentTopic} placeholder="לא בטוחה / נבחר אחר כך" />
            <Next />
          </>
        )}
        {step === 4 && (
          <>
            <Igor size={90} bob avatar={avatar} />
            <h1>איך עובדים איתי</h1>
            <div className="card" style={{ textAlign: 'start' }}>
              <p>⏱️ <b>קצר וכל יום</b>: 10–15 דקות ביום עדיף על שעתיים לפני מבחן.</p>
              <p>✏️ <b>פותרים על דף</b>: את פותרת במחברת ומצלמת לי. ככה זוכרים יותר, ופחות זמן מול המסך.</p>
              <p>📸 <b>הכפתור הסגול באמצע</b>: לצלם שיעורי בית, פתרון לבדיקה, או מה שלמדתם בשיעור.</p>
              <p style={{ marginBottom: 0 }}>💡 <b>אני לא פותר במקומך</b>: אני נותן רמזים עד שאת מצליחה לבד. ככה באמת מבינים.</p>
            </div>
            <label className="lbl" style={{ textAlign: 'start' }}>מתי להזכיר לך כל יום?</label>
            <input type="time" className="input" value={reminder} onChange={(e) => setReminder(e.target.value)} />
            <button className="btn block lg mt" onClick={() => finish(true)}>בדיקת היכרות קצרה (5 דק׳) 🚀</button>
            <p className="tiny muted">12 תרגילים קצרים כדי שאדע מאיפה להתחיל. זה לא מבחן, אין ציון!</p>
            <button className="btn plain" onClick={() => finish(false)}>אחר כך, קודם להסתכל מסביב</button>
          </>
        )}
        {step > 0 && step < 4 && <button className="btn plain" onClick={() => setStep(step - 1)}>חזרה</button>}
      </div>
    </div>
  );
}
