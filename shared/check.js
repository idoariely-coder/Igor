// בדיקת תשובות בלי AI – משותף לשרת ולאפליקציה.
function normalize(s) {
  return String(s ?? '')
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\dfrac/g, '\\frac')
    .replace(/[−–]/g, '-')
    .replace(/\\cdot|×/g, '*')
    .replace(/\\left|\\right|\\,|\\!/g, '')
    .replace(/\s+/g, '')
    .replace(/^[a-zA-Z]\d?=/, '') // x=3 → 3
    .toLowerCase();
}

export function parseNumber(raw) {
  let s = normalize(raw).replace(/,(?=\d{3}\b)/g, '');
  if (!s) return null;
  const pct = s.endsWith('%');
  if (pct) s = s.slice(0, -1);
  let v = null;
  const frac = s.match(/^\(?(-?\d+(?:\.\d+)?)\)?\/\(?(-?\d+(?:\.\d+)?)\)?$/);
  if (frac) v = Number(frac[1]) / Number(frac[2]);
  else if (/^-?\d+(\.\d+)?$/.test(s)) v = Number(s);
  else if (/^-?\d*√\d+(\.\d+)?$/.test(s) || /^-?\d*\\sqrt\{?\d+\}?$/.test(s)) {
    const m = s.match(/^(-?\d*)(?:√|\\sqrt\{?)(\d+(?:\.\d+)?)\}?$/);
    const k = m[1] === '' ? 1 : m[1] === '-' ? -1 : Number(m[1]);
    v = k * Math.sqrt(Number(m[2]));
  }
  if (v === null || !Number.isFinite(v)) return null;
  return pct ? v / 100 : v;
}

function close(a, b) {
  return Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 0.005) || Math.abs(a - b) < 0.01;
}

/** מחזיר true/false אם אפשר לבדוק מקומית, או null אם צריך את איגור. */
export function checkLocally(question, answer) {
  if (answer == null || String(answer).trim() === '') return false;
  switch (question.answer_type) {
    case 'choice':
      return normalize(answer) === normalize(question.answer);
    case 'number': {
      const a = parseNumber(answer);
      const b = parseNumber(question.answer);
      if (a === null || b === null) return null;
      return close(a, b);
    }
    case 'numbers': {
      const split = (s) => String(s).split(/[,;]|\s+או\s+|\bor\b/).map((x) => x.trim()).filter(Boolean);
      const as = split(answer).map(parseNumber);
      const bs = split(question.answer).map(parseNumber);
      if (as.some((x) => x === null) || bs.some((x) => x === null)) return null;
      if (as.length !== bs.length) return false;
      const used = new Set();
      return bs.every((b) => {
        const i = as.findIndex((a, j) => !used.has(j) && close(a, b));
        if (i < 0) return false;
        used.add(i);
        return true;
      });
    }
    default:
      if (normalize(answer) === normalize(question.answer)) return true;
      return null;
  }
}

