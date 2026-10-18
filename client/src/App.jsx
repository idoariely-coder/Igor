import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useRoute, go } from './router.js';
import { AppCtx, Celebrate, Igor, Loader, Sheet, useApp } from './ui.jsx';
import { Setup, Login, Onboarding } from './screens/Auth.jsx';
import Home from './screens/Home.jsx';
import { ChatList, Conversation, startChat } from './screens/Chat.jsx';
import { Learn, Topic } from './screens/Learn.jsx';
import Lesson from './screens/Lesson.jsx';
import Practice from './screens/Practice.jsx';
import Mistakes from './screens/Mistakes.jsx';
import { Exams, ExamDetail, MockExam } from './screens/Exams.jsx';
import { Notes, NoteDetail } from './screens/Notes.jsx';
import GraphLab from './screens/GraphLab.jsx';
import { More, Settings, Progress } from './screens/More.jsx';
import Parent from './screens/Parent.jsx';

function isFull(parts) {
  if (parts[0] === 'chat' && parts[1]) return true;
  return ['lesson', 'practice', 'mock'].includes(parts[0]);
}

export default function App() {
  const route = useRoute();
  const [status, setStatus] = useState('loading');
  const [me, setMe] = useState(null);
  const [profile, setProfileState] = useState({});
  const [setupInfo, setSetupInfo] = useState(null);
  const [demo, setDemo] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [party, setParty] = useState(0);
  const [camOpen, setCamOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/api/me');
      setMe(r.user);
      setProfileState(r.profile || {});
      setDemo(r.demo);
      setStatus('ready');
    } catch {
      const s = await api.get('/api/setup-status').catch(() => null);
      setSetupInfo(s);
      setDemo(s?.demo);
      setStatus(s?.needsSetup ? 'setup' : 'login');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const out = () => { setStatus('loading'); setMe(null); load(); };
    window.addEventListener('igor:logout', out);
    return () => window.removeEventListener('igor:logout', out);
  }, [load]);

  useEffect(() => {
    const t = profile.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }, [profile.theme]);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => setToastMsg(null), 2800);
  }, []);
  const celebrate = useCallback(() => {
    setParty((n) => n + 1);
    setTimeout(() => setParty(0), 1800);
  }, []);
  const updateProfile = useCallback(async (patch) => {
    setProfileState((p) => ({ ...p, ...patch }));
    const r = await api.patch('/api/me/profile', patch);
    setProfileState(r.profile);
    return r.profile;
  }, []);
  const logout = useCallback(async () => {
    await api.post('/api/logout').catch(() => {});
    setStatus('loading');
    setMe(null);
    go('/');
    load();
  }, [load]);

  const ctx = { me, profile, updateProfile, toast, celebrate, logout, demo, reload: load };

  let content;
  if (status === 'loading') content = <div className="main"><Loader text="טוען את איגור…" /></div>;
  else if (status === 'setup') content = <Setup onDone={load} />;
  else if (status === 'login') content = <Login users={setupInfo?.users || []} onDone={load} />;
  else if (!me) content = <div className="main"><Loader /></div>;
  else if (me.role === 'student' && !profile.onboarded) content = <Onboarding />;
  else content = me.role === 'parent' ? <ParentShell route={route} /> : <StudentShell route={route} onCamera={() => setCamOpen(true)} />;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">{content}</div>
      {status === 'ready' && me?.role === 'student' && <FocusGuard />}
      <CameraSheet open={camOpen} onClose={() => setCamOpen(false)} />
      <Celebrate show={!!party} key={party} />
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </AppCtx.Provider>
  );
}

function StudentShell({ route, onCamera }) {
  const { parts } = route;
  const p0 = parts[0] || '';
  let screen;
  switch (p0) {
    case '': screen = <Home />; break;
    case 'chat': screen = parts[1] ? <Conversation id={parts[1]} query={route.query} key={parts[1]} /> : <ChatList />; break;
    case 'learn': screen = <Learn />; break;
    case 'topic': screen = <Topic id={parts[1]} key={parts[1]} />; break;
    case 'lesson': screen = <Lesson topicId={parts[1]} query={route.query} key={parts[1]} />; break;
    case 'practice': screen = <Practice query={route.query} key={JSON.stringify(route.query)} />; break;
    case 'mistakes': screen = <Mistakes />; break;
    case 'exams': screen = <Exams />; break;
    case 'exam': screen = <ExamDetail id={parts[1]} key={parts[1]} />; break;
    case 'mock': screen = <MockExam id={parts[1]} key={parts[1]} />; break;
    case 'notes': screen = <Notes />; break;
    case 'note': screen = <NoteDetail id={parts[1]} key={parts[1]} />; break;
    case 'graph': screen = <GraphLab query={route.query} key={route.query.mode || ''} />; break;
    case 'progress': screen = <Progress />; break;
    case 'more': screen = <More />; break;
    case 'settings': screen = <Settings />; break;
    default: screen = <Home />;
  }
  const full = isFull(parts);
  const tab = { '': 'home', learn: 'learn', topic: 'learn', chat: 'chat', more: 'more', mistakes: 'more', notes: 'more', note: 'more', graph: 'more', progress: 'more', settings: 'more', exams: 'more', exam: 'more' }[p0] || 'home';
  return (
    <>
      <main className={`main${full ? ' full' : ''}`}>{screen}</main>
      {!full && (
        <nav className="nav" aria-label="ניווט">
          <NavBtn ico="🏠" label="היום" on={tab === 'home'} onClick={() => go('/')} />
          <NavBtn ico="📚" label="לימוד" on={tab === 'learn'} onClick={() => go('/learn')} />
          <button className="cam" onClick={onCamera} aria-label="צילום">📸</button>
          <NavBtn ico="💬" label="איגור" on={tab === 'chat'} onClick={() => go('/chat')} />
          <NavBtn ico="☰" label="עוד" on={tab === 'more'} onClick={() => go('/more')} />
        </nav>
      )}
    </>
  );
}

function ParentShell({ route }) {
  return (
    <main className="main" style={{ paddingBottom: 40 }}>
      {route.parts[0] === 'settings' ? <Settings /> : <Parent />}
    </main>
  );
}

function NavBtn({ ico, label, on, onClick }) {
  return (
    <button className={on ? 'active' : ''} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <span className="ico">{ico}</span>
      {label}
    </button>
  );
}

// כפתור המצלמה המרכזי – כל סוגי הצילום במקום אחד
function CameraSheet({ open, onClose }) {
  const choose = (fn) => { onClose(); fn(); };
  return (
    <Sheet open={open} onClose={onClose} title="מה מצלמים? 📸">
      <button className="sheet-opt" onClick={() => choose(() => startChat('homework', { camera: true }))}>
        <span className="so-ico">📝</span>
        <span><b>שיעורי בית</b><br /><span className="muted small">איגור יעזור לך להבין ולפתור – צעד אחרי צעד</span></span>
      </button>
      <button className="sheet-opt" onClick={() => choose(() => startChat('check', { camera: true }))}>
        <span className="so-ico">✅</span>
        <span><b>בדיקת הפתרון שלי</b><br /><span className="muted small">צלמי מה שפתרת – איגור ימצא איפה הטעות</span></span>
      </button>
      <button className="sheet-opt" onClick={() => choose(() => go('/notes', { add: 1 }))}>
        <span className="so-ico">📓</span>
        <span><b>מה למדנו בשיעור</b><br /><span className="muted small">מחברת או לוח – איגור יסכם ויתאים את עצמו למורה</span></span>
      </button>
      <button className="sheet-opt" onClick={() => choose(() => go('/exams', { add: 'photo' }))}>
        <span className="so-ico">📅</span>
        <span><b>הודעה על מבחן</b><br /><span className="muted small">איגור יבנה לך תוכנית הכנה עד המבחן</span></span>
      </button>
    </Sheet>
  );
}

// מעקב זמן מסך עדין: הפסקה כל X דקות, ותזכורת כשעוברים את המגבלה היומית
function FocusGuard() {
  const { profile, me } = useAppSafe();
  const [minutes, setMinutes] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(null);
  const [sheet, setSheet] = useState(null);
  const lastInteract = useRef(Date.now());
  const shownLimit = useRef(false);

  useEffect(() => {
    const mark = () => { lastInteract.current = Date.now(); };
    ['pointerdown', 'keydown', 'scroll'].forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastInteract.current > 120_000) return;
      setMinutes((m) => m + 1);
      const r = await api.post('/api/activity/heartbeat', { minutes: 1 }).catch(() => null);
      if (r) setTodayMinutes(r.today.minutes);
    }, 60_000);
    return () => {
      clearInterval(t);
      ['pointerdown', 'keydown', 'scroll'].forEach((e) => window.removeEventListener(e, mark));
    };
  }, []);

  const focus = Number(profile.focusMinutes) || 15;
  const limit = Number(profile.dailyLimit) || 0;
  useEffect(() => {
    if (minutes > 0 && minutes % focus === 0) setSheet('break');
  }, [minutes, focus]);
  useEffect(() => {
    if (limit && todayMinutes >= limit && !shownLimit.current) {
      shownLimit.current = true;
      setSheet('limit');
    }
  }, [todayMinutes, limit]);

  if (!me) return null;
  return (
    <Sheet open={!!sheet} onClose={() => setSheet(null)}>
      <div className="center">
        <Igor size={80} bob />
        {sheet === 'break' ? (
          <>
            <h2>עבדת {focus} דקות ברצף – וואו! 💪</h2>
            <p className="muted">המוח לומד הכי טוב עם הפסקות קטנות. קומי, תשתי מים, תסתכלי רגע מהחלון 🌤️<br />אני פה כשתחזרי.</p>
            <button className="btn block" onClick={() => setSheet(null)}>חזרתי! ממשיכים</button>
          </>
        ) : (
          <>
            <h2>סיימת את הזמן של היום 🎉</h2>
            <p className="muted">עשית עבודה מעולה היום. הכי טוב לעצור פה, ולתת למוח לעכל. נתראה מחר!</p>
            <button className="btn block" onClick={() => setSheet(null)}>רק לסיים את מה שהתחלתי</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function useAppSafe() {
  return useApp() || { profile: {}, me: null };
}

