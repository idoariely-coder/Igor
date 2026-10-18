import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { UNITS } from '../../shared/curriculum.js';
import { uploadFile, uploadUrl } from './api.js';

// --- הקשר האפליקציה ---------------------------------------------------------------
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

// --- איגור ----------------------------------------------------------------------------
export const AVATARS = ['🦉', '🤖', '🦊', '🐼', '🐱', '👾', '🐨', '🦄'];

export function Igor({ size = 48, bob = false, avatar }) {
  const app = useApp();
  const face = avatar || app?.profile?.avatar || '🦉';
  return (
    <span className={`avatar${bob ? ' bob' : ''}`} style={{ width: size, height: size, fontSize: size * 0.58 }} aria-hidden>
      {face}
    </span>
  );
}

// --- טקסט עם מתמטיקה ------------------------------------------------------------------
// מנרמל סימוני LaTeX נפוצים (\( \) ו-\[ \]) לפורמט של remark-math
function prep(text) {
  return String(text || '')
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
}

export function MathText({ children, className = '' }) {
  const text = useMemo(() => prep(children), [children]);
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// --- טעינה --------------------------------------------------------------------------------
const LOADING_LINES = ['איגור חושב…', 'מחדד עפרונות ✏️', 'מסדר את המספרים 🔢', 'בודק פעמיים שהכל נכון ✅', 'עוד רגע…'];
export function Loader({ text }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LOADING_LINES.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="loader">
      <Igor size={72} bob />
      <div className="bold">{text || LOADING_LINES[i]}</div>
      {text && <div className="muted small">{LOADING_LINES[i]}</div>}
    </div>
  );
}

// --- גיליון תחתון ----------------------------------------------------------------------
export function Sheet({ open, onClose, children, title }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="grab" />
        {title && <h2 style={{ marginTop: 0 }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

// --- חגיגה ---------------------------------------------------------------------------------
export function Celebrate({ show }) {
  const pieces = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.5, e: ['🎉', '⭐', '💜', '✨', '🔥'][i % 5] })), [show]);
  if (!show) return null;
  return (
    <div className="celebrate">
      {pieces.map((p, i) => (
        <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s` }}>{p.e}</i>
      ))}
    </div>
  );
}

// --- טבעת התקדמות -------------------------------------------------------------------------
export function Ring({ value = 0, color = 'var(--primary)', size = 46, label }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 44 44" aria-label={`${Math.round(v)}%`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">{label ?? Math.round(v)}</text>
    </svg>
  );
}

// --- מתג ------------------------------------------------------------------------------------
export function Switch({ checked, onChange }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

// --- בחירת תמונות ------------------------------------------------------------------------
export function usePhotoPicker({ kind = 'chat', onUploaded } = {}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const app = useApp();
  const pick = (capture = false) => {
    const el = inputRef.current;
    if (!el) return;
    if (capture) el.setAttribute('capture', 'environment');
    else el.removeAttribute('capture');
    el.click();
  };
  const onChange = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const out = [];
      for (const f of files.slice(0, 8)) out.push(await uploadFile(f, kind));
      onUploaded?.(out);
    } catch {
      app?.toast('ההעלאה לא הצליחה 😕 נסי שוב');
    } finally {
      setBusy(false);
    }
  };
  const input = <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={onChange} />;
  return { pick, input, busy };
}

export function Thumbs({ ids, onRemove }) {
  if (!ids?.length) return null;
  return (
    <div className="thumbs">
      {ids.map((id) => (
        <div className="thumb" key={id}>
          <img src={uploadUrl(id)} alt="" />
          {onRemove && <button onClick={() => onRemove(id)} aria-label="הסרה">✕</button>}
        </div>
      ))}
    </div>
  );
}

// --- בחירת נושא ----------------------------------------------------------------------------
export function TopicSelect({ value, onChange, multiple = false, placeholder = 'בחרי נושא' }) {
  if (multiple) {
    const set = new Set(value || []);
    return (
      <div className="col" style={{ gap: 14 }}>
        {UNITS.map((u) => (
          <div key={u.id}>
            <div className="small bold mb" style={{ marginBottom: 6 }}>{u.emoji} {u.title}</div>
            <div className="chips wrap">
              {u.subtopics.map((s) => (
                <button key={s.id} type="button" className={`chip${set.has(s.id) ? ' on' : ''}`} onClick={() => {
                  const n = new Set(set);
                  n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                  onChange([...n]);
                }}>{s.title}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {UNITS.map((u) => (
        <optgroup key={u.id} label={`${u.emoji} ${u.title}`}>
          {u.subtopics.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function BackBtn({ onClick, label = 'חזרה' }) {
  return <button className="back" onClick={onClick || (() => window.history.back())}>→ {label}</button>;
}

// --- קול: הקראה והכתבה ----------------------------------------------------------------------
export function speakable(text) {
  return String(text || '')
    .replace(/\$\$?([^$]+)\$\$?/g, (_, m) => ' ' + latexToSpeech(m) + ' ')
    .replace(/[*_#>`]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
}
function latexToSpeech(m) {
  return m
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 חלקי $2')
    .replace(/\\sqrt\{([^}]*)\}/g, 'שורש $1')
    .replace(/\^2/g, ' בריבוע')
    .replace(/\^3/g, ' בשלישית')
    .replace(/\^\{?([^} ]+)\}?/g, ' בחזקת $1')
    .replace(/\\cdot|\\times/g, ' כפול ')
    .replace(/=/g, ' שווה ')
    .replace(/-/g, ' מינוס ')
    .replace(/\+/g, ' ועוד ')
    .replace(/\\[a-z]+/gi, ' ')
    .replace(/[{}]/g, '');
}
export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  u.lang = 'he-IL';
  u.rate = 1;
  const he = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith('he'));
  if (he) u.voice = he;
  window.speechSynthesis.speak(u);
  return true;
}

export function useDictation(onText) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const toggle = () => {
    if (!SR) return false;
    if (listening) {
      recRef.current?.stop();
      return true;
    }
    const rec = new SR();
    rec.lang = 'he-IL';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => onText([...e.results].map((r) => r[0].transcript).join(' '));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
    return true;
  };
  return { supported: !!SR, listening, toggle };
}

export function fmtDate(day) {
  if (!day) return '';
  const d = new Date(day.length <= 10 ? day + 'T12:00:00' : day.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function daysLabel(n) {
  if (n === 0) return 'היום!';
  if (n === 1) return 'מחר';
  if (n === 2) return 'מחרתיים';
  return `בעוד ${n} ימים`;
}
