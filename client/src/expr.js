// מפענח ביטויים פשוט ובטוח: 2x^2-3x+1, √(x+4), |x-2|, sin(x)
export function compile(src) {
  const s = String(src)
    .replace(/\s+/g, '')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/π/g, 'pi')
    .replace(/[−–]/g, '-')
    .replace(/[·×]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√/g, 'sqrt')
    .toLowerCase();
  let i = 0;
  const peek = () => s[i];
  const eat = (c) => (s[i] === c ? (i++, true) : false);

  function parseExpr() {
    let left = parseTerm();
    for (;;) {
      if (eat('+')) { const l = left, r = parseTerm(); left = (x) => l(x) + r(x); }
      else if (eat('-')) { const l = left, r = parseTerm(); left = (x) => l(x) - r(x); }
      else return left;
    }
  }
  function startsFactor() {
    const c = peek();
    return c !== undefined && (/[0-9.x(a-z|]/.test(c));
  }
  function parseTerm() {
    let left = parseUnary();
    for (;;) {
      if (eat('*')) { const l = left, r = parseUnary(); left = (x) => l(x) * r(x); }
      else if (eat('/')) { const l = left, r = parseUnary(); left = (x) => l(x) / r(x); }
      else if (startsFactor() && peek() !== '|') { const l = left, r = parseUnary(); left = (x) => l(x) * r(x); } // כפל מרומז
      else return left;
    }
  }
  function parseUnary() {
    if (eat('-')) { const f = parseUnary(); return (x) => -f(x); }
    if (eat('+')) return parseUnary();
    return parsePow();
  }
  function parsePow() {
    const base = parseAtom();
    if (eat('^')) { const e = parseUnary(); return (x) => Math.pow(base(x), e(x)); }
    return base;
  }
  function parseAtom() {
    const c = peek();
    if (c === '(') { i++; const f = parseExpr(); if (!eat(')')) throw new Error('חסר סוגר'); return f; }
    if (c === '|') { i++; const f = parseExpr(); if (!eat('|')) throw new Error('חסר |'); return (x) => Math.abs(f(x)); }
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^\d*\.?\d+/);
      i += m[0].length;
      const v = Number(m[0]);
      return () => v;
    }
    const word = s.slice(i).match(/^[a-z]+/)?.[0];
    if (!word) throw new Error('ביטוי לא תקין');
    const fns = { sqrt: Math.sqrt, abs: Math.abs, sin: (v) => Math.sin((v * Math.PI) / 180), cos: (v) => Math.cos((v * Math.PI) / 180), tan: (v) => Math.tan((v * Math.PI) / 180) };
    for (const name of Object.keys(fns)) {
      if (word.startsWith(name)) {
        i += name.length;
        const arg = peek() === '(' ? parseAtom() : parsePow();
        const fn = fns[name];
        return (x) => fn(arg(x));
      }
    }
    if (word.startsWith('pi')) { i += 2; return () => Math.PI; }
    if (word.startsWith('x')) { i += 1; return (x) => x; }
    if (word.startsWith('e')) { i += 1; return () => Math.E; }
    throw new Error('לא הכרתי: ' + word);
  }

  const f = parseExpr();
  if (i < s.length) throw new Error('ביטוי לא תקין');
  return f;
}

export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

// חיפוש שורשים ונקודות קיצון מספרית
export function analyze(f, xmin, xmax) {
  const N = 1200;
  const roots = [];
  const extrema = [];
  const dx = (xmax - xmin) / N;
  let prev = f(xmin);
  for (let k = 1; k <= N; k++) {
    const x = xmin + k * dx;
    const y = f(x);
    if (Number.isFinite(prev) && Number.isFinite(y)) {
      if (y === 0 || prev * y < 0) {
        let a = x - dx, b = x;
        for (let j = 0; j < 40; j++) { const m = (a + b) / 2; if (f(a) * f(m) <= 0) b = m; else a = m; }
        const r = (a + b) / 2;
        if (!roots.some((q) => Math.abs(q - r) < dx * 2)) roots.push(r);
      }
      const y2 = f(x + dx);
      if (Number.isFinite(y2) && ((y > prev && y > y2) || (y < prev && y < y2))) extrema.push({ x, y, type: y > prev ? 'max' : 'min' });
    }
    prev = y;
  }
  return { roots, extrema };
}
