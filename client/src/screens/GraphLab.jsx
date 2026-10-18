import { useMemo, useState } from 'react';
import { go } from '../router.js';
import { BackBtn, MathText } from '../ui.jsx';
import { compile, fmt, analyze } from '../expr.js';
import { startChat } from './Chat.jsx';

const W = 360, H = 300;

function Plot({ fns, view, points = [] }) {
  const { xmin, xmax, ymin, ymax } = view;
  const sx = (x) => ((x - xmin) / (xmax - xmin)) * W;
  const sy = (y) => H - ((y - ymin) / (ymax - ymin)) * H;
  const step = (xmax - xmin) / 16 > 1.5 ? 2 : 1;
  const grid = [];
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) grid.push(<line key={`gx${x}`} x1={sx(x)} x2={sx(x)} y1={0} y2={H} stroke="var(--line)" strokeWidth="1" />);
  for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) grid.push(<line key={`gy${y}`} y1={sy(y)} y2={sy(y)} x1={0} x2={W} stroke="var(--line)" strokeWidth="1" />);
  const labels = [];
  for (let x = Math.ceil(xmin / (step * 2)) * step * 2; x <= xmax; x += step * 2) if (x !== 0) labels.push(<text key={`lx${x}`} x={sx(x)} y={Math.min(H - 4, Math.max(12, sy(0) + 14))} fontSize="10" textAnchor="middle" fill="var(--muted)">{x}</text>);
  for (let y = Math.ceil(ymin / (step * 2)) * step * 2; y <= ymax; y += step * 2) if (y !== 0) labels.push(<text key={`ly${y}`} x={Math.min(W - 14, Math.max(10, sx(0) - 6))} y={sy(y) + 3} fontSize="10" textAnchor="end" fill="var(--muted)">{y}</text>);

  const paths = fns.map(({ f, color }, k) => {
    let d = '';
    let pen = false;
    for (let px = 0; px <= W; px += 1.5) {
      const x = xmin + (px / W) * (xmax - xmin);
      let y;
      try { y = f(x); } catch { y = NaN; }
      if (!Number.isFinite(y) || y > ymax + (ymax - ymin) * 2 || y < ymin - (ymax - ymin) * 2) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${px.toFixed(1)},${sy(y).toFixed(1)}`;
      pen = true;
    }
    return <path key={k} d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="גרף">
      {grid}
      <line x1={0} x2={W} y1={sy(0)} y2={sy(0)} stroke="var(--muted)" strokeWidth="1.5" />
      <line y1={0} y2={H} x1={sx(0)} x2={sx(0)} stroke="var(--muted)" strokeWidth="1.5" />
      {labels}
      {paths}
      {points.map((p, k) => Number.isFinite(p.y) && (
        <g key={k}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r="5" fill={p.color || 'var(--accent)'} stroke="var(--surface)" strokeWidth="2" />
          {p.label && <text x={sx(p.x) + 7} y={sy(p.y) - 7} fontSize="11" fontWeight="600" fill="var(--ink)">{p.label}</text>}
        </g>
      ))}
    </svg>
  );
}

function Slider({ label, value, onChange, min = -10, max = 10, step = 0.5 }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <b style={{ width: 22, direction: 'ltr' }}>{label}</b>
      <input type="range" className="slider grow" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span style={{ width: 40, textAlign: 'center', direction: 'ltr' }} className="bold">{value}</span>
    </div>
  );
}

function sign(n, first = false) {
  if (n === 0) return '';
  if (first) return n < 0 ? '-' : '';
  return n < 0 ? ' - ' : ' + ';
}
function coef(n, first, sym) {
  if (n === 0) return '';
  const a = Math.abs(n);
  return `${sign(n, first)}${a === 1 && sym ? '' : a}${sym}`;
}

export default function GraphLab({ query }) {
  const [mode, setMode] = useState(query.mode || 'linear');
  const [m, setM] = useState(1);
  const [b, setB] = useState(0);
  const [qa, setQa] = useState(1);
  const [qb, setQb] = useState(0);
  const [qc, setQc] = useState(-4);
  const [expr1, setExpr1] = useState(query.f || 'x^3-3x');
  const [expr2, setExpr2] = useState('');
  const [zoom, setZoom] = useState(10);

  const view = { xmin: -zoom, xmax: zoom, ymin: -zoom * (H / W), ymax: zoom * (H / W) };

  const result = useMemo(() => {
    if (mode === 'linear') {
      const f = (x) => m * x + b;
      const formula = `y = ${m === 0 ? '' : `${m === 1 ? '' : m === -1 ? '-' : m}x`}${m === 0 ? b : b ? `${b < 0 ? ' - ' : ' + '}${Math.abs(b)}` : ''}`;
      const facts = [
        `**שיפוע** $m = ${m}$ – ${m > 0 ? 'הישר **עולה** (משמאל לימין)' : m < 0 ? 'הישר **יורד**' : 'ישר **אופקי**'}`,
        `**חיתוך עם ציר y:** $(0, ${fmt(b)})$`,
        m !== 0 ? `**חיתוך עם ציר x:** $(${fmt(-b / m)}, 0)$` : b === 0 ? 'הישר הוא ציר ה-x עצמו' : 'אין חיתוך עם ציר x (ישר מקביל לציר)',
      ];
      const points = [{ x: 0, y: b, label: `(0, ${fmt(b)})` }];
      if (m !== 0) points.push({ x: -b / m, y: 0, label: `(${fmt(-b / m)}, 0)`, color: '#0ea5e9' });
      return { fns: [{ f, color: 'var(--primary)' }], formula, facts, points, desc: formula };
    }
    if (mode === 'quadratic') {
      const a = qa || 0.5;
      const f = (x) => a * x * x + qb * x + qc;
      const xv = -qb / (2 * a);
      const yv = f(xv);
      const D = qb * qb - 4 * a * qc;
      const formula = `y = ${coef(a, true, 'x^2')}${coef(qb, false, 'x')}${qc ? `${qc < 0 ? ' - ' : ' + '}${Math.abs(qc)}` : ''}`;
      const roots = D > 0 ? [(-qb - Math.sqrt(D)) / (2 * a), (-qb + Math.sqrt(D)) / (2 * a)].sort((p, q) => p - q) : D === 0 ? [xv] : [];
      const facts = [
        `${a > 0 ? '**פתוחה למעלה** ∪ (כי $a > 0$) – לקודקוד יש **מינימום**' : '**פתוחה למטה** ∩ (כי $a < 0$) – לקודקוד יש **מקסימום**'}`,
        `**הקודקוד:** $x = -\\frac{b}{2a} = ${fmt(xv)}$, ולכן $(${fmt(xv)}, ${fmt(yv)})$`,
        `**חיתוך עם ציר y:** $(0, ${fmt(qc)})$`,
        `**הדיסקרימיננטה:** $\\Delta = b^2 - 4ac = ${fmt(D)}$ → ${D > 0 ? `**שתי** נקודות חיתוך עם ציר x: ${roots.map((r) => `$x=${fmt(r)}$`).join(', ')}` : D === 0 ? `נקודת חיתוך **אחת** (הקודקוד נוגע בציר)` : '**אין** חיתוך עם ציר x'}`,
        a > 0 ? `**עולה** כש-$x > ${fmt(xv)}$, **יורדת** כש-$x < ${fmt(xv)}$` : `**עולה** כש-$x < ${fmt(xv)}$, **יורדת** כש-$x > ${fmt(xv)}$`,
      ];
      const points = [{ x: xv, y: yv, label: `(${fmt(xv)}, ${fmt(yv)})` }, ...roots.map((r) => ({ x: r, y: 0, color: '#0ea5e9' })), { x: 0, y: qc, color: '#16a34a' }];
      return { fns: [{ f, color: 'var(--primary)' }], formula, facts, points, desc: formula };
    }
    // חופשי
    try {
      const f = compile(expr1);
      const fns = [{ f, color: 'var(--primary)' }];
      const { roots, extrema } = analyze(f, view.xmin, view.xmax);
      const facts = [];
      if (roots.length) facts.push(`**חיתוך עם ציר x:** ${roots.slice(0, 6).map((r) => `$x \\approx ${fmt(r)}$`).join(', ')}`);
      else facts.push('אין חיתוך עם ציר x בתחום שרואים');
      const y0 = f(0);
      if (Number.isFinite(y0)) facts.push(`**חיתוך עם ציר y:** $(0, ${fmt(y0)})$`);
      if (extrema.length) facts.push(`**נקודות קיצון:** ${extrema.slice(0, 6).map((e) => `${e.type === 'max' ? 'מקסימום' : 'מינימום'} $(${fmt(e.x)}, ${fmt(e.y)})$`).join(', ')}`);
      const points = [...roots.map((r) => ({ x: r, y: 0, color: '#0ea5e9' })), ...extrema.map((e) => ({ x: e.x, y: e.y, label: `(${fmt(e.x)}, ${fmt(e.y)})` }))];
      if (expr2.trim()) {
        const g = compile(expr2);
        fns.push({ f: g, color: 'var(--accent)' });
        const h = (x) => f(x) - g(x);
        const meet = analyze(h, view.xmin, view.xmax).roots;
        facts.push(meet.length ? `**הגרפים נפגשים ב:** ${meet.slice(0, 6).map((x) => `$(${fmt(x)}, ${fmt(f(x))})$`).join(', ')}` : 'הגרפים לא נפגשים בתחום שרואים');
        meet.forEach((x) => points.push({ x, y: f(x), color: '#16a34a' }));
      }
      return { fns, formula: `f(x) = ${expr1}`, facts, points, desc: `f(x) = ${expr1}${expr2 ? `, g(x) = ${expr2}` : ''}` };
    } catch (e) {
      return { fns: [], formula: '', facts: [`🙈 ${e.message}. דוגמאות: \`x^2-4\`, \`2x+1\`, \`sqrt(x)\`, \`|x-2|\``], points: [], desc: expr1 };
    }
  }, [mode, m, b, qa, qb, qc, expr1, expr2, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <BackBtn onClick={() => go('/more')} />
      <h1>📈 מעבדת גרפים</h1>
      <div className="seg mb">
        <button className={mode === 'linear' ? 'on' : ''} onClick={() => setMode('linear')}>ישר</button>
        <button className={mode === 'quadratic' ? 'on' : ''} onClick={() => setMode('quadratic')}>פרבולה</button>
        <button className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>חופשי</button>
      </div>

      {result.formula && <div className="formula"><MathText>{`$${result.formula.replace(/sqrt/g, '\\sqrt').replace(/\*/g, '\\cdot ')}$`}</MathText></div>}
      <div className="graph-wrap">
        <Plot fns={result.fns} view={view} points={result.points} />
        <div className="row" style={{ justifyContent: 'center', gap: 8, paddingTop: 4 }}>
          <button className="btn plain sm" onClick={() => setZoom((z) => Math.min(50, z * 1.5))}>➖ התרחקות</button>
          <button className="btn plain sm" onClick={() => setZoom((z) => Math.max(2, z / 1.5))}>➕ התקרבות</button>
        </div>
      </div>

      <div className="card mt col">
        {mode === 'linear' && (
          <>
            <Slider label="m" value={m} onChange={setM} />
            <Slider label="b" value={b} onChange={setB} />
            <p className="tiny muted" style={{ margin: 0 }}>הזיזי את m וראי איך השיפוע משתנה. מה קורה כש-m שלילי?</p>
          </>
        )}
        {mode === 'quadratic' && (
          <>
            <Slider label="a" value={qa} onChange={(v) => setQa(v === 0 ? 0.5 : v)} min={-5} max={5} />
            <Slider label="b" value={qb} onChange={setQb} />
            <Slider label="c" value={qc} onChange={setQc} />
            <p className="tiny muted" style={{ margin: 0 }}>נסי: מה קורה לפרבולה כשמשנים רק את c? ורק את a?</p>
          </>
        )}
        {mode === 'custom' && (
          <>
            <label className="lbl" style={{ marginTop: 0 }}>f(x) =</label>
            <input className="input answer-input" dir="ltr" value={expr1} onChange={(e) => setExpr1(e.target.value)} placeholder="x^2-4" />
            <label className="lbl">g(x) = (לא חובה – להשוואה)</label>
            <input className="input answer-input" dir="ltr" value={expr2} onChange={(e) => setExpr2(e.target.value)} placeholder="2x+1" />
          </>
        )}
      </div>

      <div className="card">
        <h3>מה רואים בגרף?</h3>
        {result.facts.map((f, i) => <MathText key={i} className="small" >{`• ${f}`}</MathText>)}
      </div>

      <button className="btn block ghost" onClick={() => startChat('topic', { topicId: mode === 'linear' ? 'linear' : mode === 'quadratic' ? 'quadratic' : 'funcprops', text: `אני מסתכלת על הגרף של ${result.desc}. תסביר לי מה רואים בו ולמה?` })}>💬 לשאול את איגור על הגרף הזה</button>
    </>
  );
}
