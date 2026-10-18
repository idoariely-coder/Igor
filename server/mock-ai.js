// מצב הדגמה: עובד בלי מפתח API, כדי לבדוק את הממשק. התשובות קבועות.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function streamChat({ onText }) {
  const reply = `היי! 👋 אני איגור (במצב הדגמה – עדיין לא חובר מפתח API).

בואי נסתכל על זה יחד. **מה הדבר הראשון שמבקשים בתרגיל?**

רמז קטן: אם יש לנו ישר $y = 2x + 3$, השיפוע הוא המספר שליד $x$.

מה לדעתך השיפוע כאן?`;
  for (const chunk of reply.match(/.{1,12}/gs)) {
    onText(chunk);
    await sleep(25);
  }
  return reply;
}

const Q = [
  { topic_id: 'slope', prompt: 'מה השיפוע של הישר העובר בנקודות $A(1, 2)$ ו-$B(3, 8)$?', answer_type: 'number', choices: [], answer: '3', hints: ['שיפוע = הפרש ה-y חלקי הפרש ה-x', '$m = \\frac{8-2}{3-1}$'], solution: '$m = \\frac{y_2-y_1}{x_2-x_1} = \\frac{8-2}{3-1} = \\frac{6}{2} = 3$', difficulty: 1, skill: 'שיפוע משתי נקודות' },
  { topic_id: 'quadeq', prompt: 'פתרי את המשוואה $x^2 - 5x + 6 = 0$', answer_type: 'numbers', choices: [], answer: '2, 3', hints: ['נסי לפרק לגורמים: אילו שני מספרים שמכפלתם 6 וסכומם 5?', '$(x-2)(x-3)=0$'], solution: '$(x-2)(x-3)=0$ ולכן $x=2$ או $x=3$', difficulty: 2, skill: 'פתרון בפירוק' },
  { topic_id: 'lineeq', prompt: 'איזו משוואה מתארת ישר ששיפועו $2$ והוא חותך את ציר ה-$y$ ב-$(0, -1)$?', answer_type: 'choice', choices: ['$y = 2x - 1$', '$y = -x + 2$', '$y = 2x + 1$', '$y = x - 2$'], answer: '$y = 2x - 1$', hints: ['בצורה $y = mx + b$: $m$ הוא השיפוע ו-$b$ נקודת החיתוך עם ציר y'], solution: '$m=2$, $b=-1$ ולכן $y = 2x - 1$', difficulty: 1, skill: 'y=mx+b' },
  { topic_id: 'powers', prompt: 'חשבי: $2^3 \\cdot 2^2$', answer_type: 'number', choices: [], answer: '32', hints: ['כשכופלים חזקות עם אותו בסיס – מחברים את המעריכים'], solution: '$2^{3+2} = 2^5 = 32$', difficulty: 1, skill: 'חוקי חזקות' },
  { topic_id: 'factoring', prompt: 'פרקי לגורמים: $x^2 - 9$', answer_type: 'expression', choices: [], answer: '(x-3)(x+3)', hints: ['זה הפרש ריבועים: $a^2 - b^2$'], solution: '$x^2 - 9 = (x-3)(x+3)$', difficulty: 1, skill: 'הפרש ריבועים' },
];

export async function json(kind) {
  await sleep(600);
  switch (kind) {
    case 'questions':
      return { questions: Q.map((q) => ({ ...q })) };
    case 'check':
      return { correct: true, feedback: 'נכון! כל הכבוד 🎉' };
    case 'lesson':
      return {
        title: 'שיפוע של ישר',
        cards: [
          { kind: 'explain', title: 'מה זה שיפוע?', body: 'שיפוע אומר **כמה הישר עולה** כשהולכים צעד אחד ימינה. כמו מדרגות: כמה גבוהה כל מדרגה?', question: '', answer_type: 'none', choices: [], answer: '', hint: '', solution: '' },
          { kind: 'example', title: 'דוגמה', body: 'הישר עובר ב-$(0,1)$ וב-$(2,5)$. עלינו $4$ למעלה והלכנו $2$ ימינה, אז: $$m = \\frac{4}{2} = 2$$', question: '', answer_type: 'none', choices: [], answer: '', hint: '', solution: '' },
          { kind: 'try', title: 'נסי בעצמך', body: 'עכשיו תורך!', question: 'מה השיפוע בין $(0,0)$ ל-$(3,6)$?', answer_type: 'number', choices: [], answer: '2', hint: 'עלייה חלקי התקדמות: $\\frac{6}{3}$', solution: '$m=\\frac{6-0}{3-0}=2$' },
          { kind: 'tip', title: 'טיפ למבחן', body: 'שיפוע שלילי = הישר **יורד** משמאל לימין. בדקי תמיד אם התשובה הגיונית לפי הציור.', question: '', answer_type: 'none', choices: [], answer: '', hint: '', solution: '' },
        ],
      };
    case 'note':
      return { title: 'שיפוע ומשוואת ישר', topic_id: 'lineeq', summary: '**מה למדנו:**\n- שיפוע: $m = \\frac{y_2-y_1}{x_2-x_1}$\n- משוואת ישר: $y - y_1 = m(x - x_1)$', notation: 'המורה מסמן שיפוע באות m וכותב נקודות עם אותיות גדולות', unclear: '' };
    case 'examInfo':
      return { title: 'מבחן בגיאומטריה אנליטית', date: '', topic_ids: ['points', 'midpoint', 'slope', 'lineeq'], notes: '' };
    case 'mockExam':
      return {
        questions: [
          { topic_id: 'lineeq', intro: 'נתונות הנקודות $A(1,2)$ ו-$B(5,10)$.', parts: [
            { label: 'א', prompt: 'מצאי את שיפוע הישר $AB$.', points: 15, answer: '2', solution: '$m=\\frac{10-2}{5-1}=2$' },
            { label: 'ב', prompt: 'מצאי את משוואת הישר $AB$.', points: 20, answer: 'y=2x', solution: '$y-2=2(x-1) \\Rightarrow y=2x$' },
          ] },
          { topic_id: 'midpoint', intro: 'המשך לשאלה 1.', parts: [
            { label: 'א', prompt: 'מצאי את אמצע הקטע $AB$.', points: 30, answer: '(3,6)', solution: '$(\\frac{1+5}{2},\\frac{2+10}{2})=(3,6)$' },
            { label: 'ב', prompt: 'מצאי את אורך הקטע $AB$.', points: 35, answer: '√80', solution: '$\\sqrt{16+64}=\\sqrt{80}$' },
          ] },
        ],
      };
    case 'grade':
      return { parts: [{ label: 'א', score: 15, max: 15, feedback: 'מעולה!' }, { label: 'ב', score: 10, max: 20, feedback: 'הדרך נכונה, טעות קטנה בחישוב.' }], summary: 'עבודה יפה! כדאי לחזק את משוואת הישר.' };
    default:
      return {};
  }
}

export async function text(kind) {
  await sleep(300);
  if (kind === 'parent') return 'השבוע היה שבוע טוב: היא תרגלה 4 ימים ושיפרה את השליטה בשיפוע. עדיין קשה לה במשוואות ריבועיות. המלצה: לשאול אותה בארוחת ערב "מה איגור לימד אותך השבוע?" – להסביר למישהו אחר מחזק את ההבנה. (מצב הדגמה)';
  return '';
}
