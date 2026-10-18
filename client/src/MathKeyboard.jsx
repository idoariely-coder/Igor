// מקלדת מתמטית קטנה שמוסיפה סימנים לתיבת טקסט
const KEYS = [
  ['x', 'x'], ['y', 'y'], ['²', '^2'], ['xⁿ', '^'], ['√', '√('], ['(', '('], [')', ')'], ['/', '/'],
  ['π', 'π'], ['±', '±'], ['≤', '≤'], ['≥', '≥'], ['°', '°'], ['|x|', '|'], ['=', '='], ['·', '*'],
  ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['∞', '∞'], ['<', '<'], ['>', '>'],
];

export function insertAt(el, text, setValue) {
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el.focus({ preventScroll: true });
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
  });
}

export default function MathKeyboard({ targetRef, setValue, onClose }) {
  const press = (val) => insertAt(targetRef.current, val, setValue);
  const backspace = () => {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const from = start === end ? Math.max(0, start - 1) : start;
    setValue(el.value.slice(0, from) + el.value.slice(end));
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(from, from);
    });
  };
  return (
    <div className="mathkb" onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.target.tagName === 'BUTTON' && e.preventDefault()}>
      {KEYS.map(([label, val]) => (
        <button key={label} type="button" onClick={() => press(val)} onTouchEnd={(e) => { e.preventDefault(); press(val); }}>{label}</button>
      ))}
      <button type="button" className="act" onClick={backspace} onTouchEnd={(e) => { e.preventDefault(); backspace(); }}>⌫</button>
      {onClose && <button type="button" className="act" onClick={onClose}>✓</button>}
    </div>
  );
}
