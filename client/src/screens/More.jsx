import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { go } from '../router.js';
import { AVATARS, BackBtn, Igor, Loader, Ring, Switch, TopicSelect, useApp } from '../ui.jsx';

export function More() {
  const { me } = useApp();
  const items = [
    ['📝', 'מבחנים', 'תוכניות הכנה ומבחני דמה', '/exams'],
    ['🔁', 'מחברת טעויות', 'חוזרים על מה שהיה קשה', '/mistakes'],
    ['📓', 'מחברת הכיתה', 'צילומים וסיכומים מהשיעורים', '/notes'],
    ['📈', 'מעבדת גרפים', 'משחקים עם ישרים ופרבולות', '/graph'],
    ['🏆', 'ההתקדמות שלי', 'מה כבר שולטת ומה לחזק', '/progress'],
    ['⚙️', 'הגדרות', 'איגור, תזכורות, ריכוז', '/settings'],
  ];
  return (
    <>
      <div className="hero">
        <Igor size={56} />
        <div className="grow"><h1>{me.name}</h1><div className="muted small">כל הכלים שלך</div></div>
      </div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {items.map(([ico, title, sub, path]) => (
          <button key={path} className="list-btn" onClick={() => go(path)}>
            <span className="li-ico">{ico}</span>
            <span className="grow"><b>{title}</b><br /><span className="tiny muted">{sub}</span></span>
            <span className="muted">←</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function Progress() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/api/progress').then(setData); }, []);
  if (!data) return <Loader />;
  const { units, streak, week } = data;
  const strong = units.flatMap((u) => u.subtopics.map((s) => ({ ...s, unit: u }))).filter((s) => s.score >= 80);
  const weak = units.flatMap((u) => u.subtopics.map((s) => ({ ...s, unit: u }))).filter((s) => s.score !== null && s.score < 50);

  return (
    <>
      <BackBtn onClick={() => go('/more')} />
      <h1>🏆 ההתקדמות שלי</h1>
      <div className="card soft">
        <div className="row">
          <Igor size={52} />
          <div className="grow">
            <b>שלב {streak.level}</b> · {streak.totalXp} נקודות
            <div className="bar mt"><i style={{ width: `${Math.round(streak.levelProgress * 100)}%` }} /></div>
          </div>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat"><b>🔥 {streak.streak}</b><span>ימים ברצף</span></div>
        <div className="stat"><b>{week.total}</b><span>תרגילים השבוע</span></div>
        <div className="stat"><b>{week.total ? Math.round((week.correct / week.total) * 100) : 0}%</b><span>הצלחה השבוע</span></div>
      </div>

      {strong.length > 0 && (
        <div className="card">
          <h3>🌟 כבר שולטת</h3>
          <div className="chips wrap mt">{strong.map((s) => <span key={s.id} className="chip">{s.title}</span>)}</div>
        </div>
      )}
      {weak.length > 0 && (
        <div className="card">
          <h3>💪 שווה לחזק</h3>
          <div className="chips wrap mt">{weak.map((s) => <button key={s.id} className="chip" onClick={() => go('/practice', { topic: s.id })}>{s.title} ←</button>)}</div>
        </div>
      )}

      <h2>לפי פרקים</h2>
      {units.map((u) => (
        <button key={u.id} className="card tap row" onClick={() => go('/learn')}>
          <span style={{ fontSize: 26 }}>{u.emoji}</span>
          <span className="grow"><b>{u.title}</b><br /><span className="tiny muted">{u.practiced}/{u.total} נושאים תורגלו</span></span>
          <Ring value={u.score} color={u.color} />
        </button>
      ))}
    </>
  );
}

async function enablePush(toast) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast('באייפון: קודם "הוספה למסך הבית", ואז לפתוח את איגור משם');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('לא אושרו התראות'); return false; }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api.get('/api/push/key');
    const pad = '='.repeat((4 - (key.length % 4)) % 4);
    const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from([...raw].map((c) => c.charCodeAt(0))) });
    await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
    await api.post('/api/push/test');
    toast('התראות הופעלו ✓');
    return true;
  } catch {
    toast('לא הצלחתי להפעיל התראות');
    return false;
  }
}

export function Settings() {
  const { me, profile, updateProfile, toast, logout, reload } = useApp();
  const [name, setName] = useState(me.name);
  const [pins, setPins] = useState({ oldPin: '', newPin: '' });
  const isStudent = me.role === 'student';

  const changePin = async () => {
    try {
      await api.post('/api/me/pin', pins);
      setPins({ oldPin: '', newPin: '' });
      toast('הקוד הוחלף ✓');
    } catch {
      toast('הקוד הישן לא נכון או שהחדש לא 4 ספרות');
    }
  };

  return (
    <>
      <BackBtn onClick={() => go(isStudent ? '/more' : '/')} />
      <h1>⚙️ הגדרות</h1>

      {isStudent && (
        <>
          <div className="card">
            <h3>איגור</h3>
            <div className="chips wrap mt">
              {AVATARS.map((a) => <button key={a} className={`chip${(profile.avatar || '🦉') === a ? ' on' : ''}`} style={{ fontSize: 24 }} onClick={() => updateProfile({ avatar: a })}>{a}</button>)}
            </div>
            <div className="row between mt">
              <span>🔊 כפתור הקראה בהודעות</span>
              <Switch checked={profile.voice !== false} onChange={(v) => updateProfile({ voice: v })} />
            </div>
          </div>

          <div className="card">
            <h3>עליי</h3>
            <label className="lbl">השם שלי</label>
            <div className="row">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn sm" onClick={() => updateProfile({ name }).then(() => { toast('נשמר ✓'); reload(); })}>שמירה</button>
            </div>
            <label className="lbl">מה אני אוהבת (לדוגמאות של איגור)</label>
            <input className="input" defaultValue={profile.interests || ''} onBlur={(e) => updateProfile({ interests: e.target.value })} placeholder="מוזיקה, כדורעף, ציור…" />
            <label className="lbl">מה לומדים עכשיו בכיתה</label>
            <TopicSelect value={profile.currentTopic} onChange={(v) => updateProfile({ currentTopic: v })} placeholder="לא נבחר" />
          </div>

          <div className="card">
            <h3>ריכוז וזמן מסך</h3>
            <label className="lbl">הפסקה קטנה כל</label>
            <div className="seg">
              {[10, 15, 20, 25].map((m) => <button key={m} className={(Number(profile.focusMinutes) || 15) === m ? 'on' : ''} onClick={() => updateProfile({ focusMinutes: m })}>{m} דק׳</button>)}
            </div>
            <label className="lbl">זמן מומלץ ביום</label>
            <div className="seg">
              {[20, 30, 40, 60, 0].map((m) => <button key={m} className={(Number(profile.dailyLimit) || 0) === m ? 'on' : ''} onClick={() => updateProfile({ dailyLimit: m })}>{m ? `${m}` : 'ללא'}</button>)}
            </div>
            <div className="row between mt">
              <span>⏳ תוספת זמן במבחני דמה (25%)</span>
              <Switch checked={!!profile.extraTime} onChange={(v) => updateProfile({ extraTime: v })} />
            </div>
          </div>

          <div className="card">
            <h3>תזכורת יומית</h3>
            <div className="row mt">
              <input type="time" className="input" value={profile.reminderTime || ''} onChange={(e) => updateProfile({ reminderTime: e.target.value })} />
              <button className="btn sm ghost" onClick={() => enablePush(toast)}>הפעלת התראות</button>
            </div>
            <p className="tiny muted">באייפון/אייפד: בספארי לוחצים על כפתור השיתוף ← "הוספה למסך הבית", פותחים את איגור מהאייקון, ואז מפעילים התראות.</p>
          </div>
        </>
      )}

      <div className="card">
        <h3>תצוגה</h3>
        <div className="seg mt">
          {[['auto', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']].map(([k, l]) => <button key={k} className={(profile.theme || 'auto') === k ? 'on' : ''} onClick={() => updateProfile({ theme: k })}>{l}</button>)}
        </div>
      </div>

      <div className="card">
        <h3>החלפת קוד</h3>
        <div className="row mt">
          <input className="input" inputMode="numeric" type="password" placeholder="קוד נוכחי" value={pins.oldPin} onChange={(e) => setPins({ ...pins, oldPin: e.target.value })} />
          <input className="input" inputMode="numeric" type="password" placeholder="קוד חדש" value={pins.newPin} onChange={(e) => setPins({ ...pins, newPin: e.target.value })} />
        </div>
        <button className="btn sm ghost mt" onClick={changePin}>החלפה</button>
      </div>

      <button className="btn block light" onClick={logout}>יציאה מהחשבון</button>
      <p className="tiny muted center mt">איגור · המורה הפרטי למתמטיקה · כיתה י׳ 4 יח״ל</p>
    </>
  );
}
