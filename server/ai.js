import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, one } from './db.js';
import { ALL_SUBTOPICS } from '../shared/curriculum.js';
import * as mock from './mock-ai.js';

export const MODEL = process.env.IGOR_MODEL || 'claude-opus-5-5';
export const MOCK = process.env.IGOR_MOCK === '1' || (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN);

const client = MOCK ? null : new Anthropic();
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
let fallbackSupported = true;

const REFUSAL_TEXT = 'אופס, את זה אני לא יכול לענות 🙈 בואי נחזור למתמטיקה – על מה עובדים?';

// --- תמונות ---------------------------------------------------------------
export function imageBlock(uploadId) {
  const row = one('SELECT * FROM uploads WHERE id = ?', uploadId);
  if (!row) return null;
  const file = path.join(UPLOAD_DIR, row.id);
  if (!fs.existsSync(file)) return null;
  if (row.mime === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(file).toString('base64') } };
  }
  return { type: 'image', source: { type: 'base64', media_type: row.mime, data: fs.readFileSync(file).toString('base64') } };
}

export function userContent(text, uploadIds = []) {
  const blocks = uploadIds.map(imageBlock).filter(Boolean);
  if (text) blocks.push({ type: 'text', text });
  if (!blocks.length) blocks.push({ type: 'text', text: '(ללא טקסט)' });
  return blocks;
}

// --- קריאות בסיס ------------------------------------------------------------
function withFallback(params, useFallback = fallbackSupported) {
  if (!useFallback) return { api: client.messages, params };
  return { api: client.beta.messages, params: { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' } };
}

// fn(useFallback) – אם בקשה עם fallbacks נדחית (400) והבקשה בלעדיהם מצליחה, ממשיכים בלעדיהם מעכשיו
async function callWithFallbackRetry(fn) {
  try {
    return await fn(fallbackSupported);
  } catch (err) {
    if (!fallbackSupported || !(err instanceof Anthropic.BadRequestError)) throw err;
    const out = await fn(false);
    fallbackSupported = false;
    console.warn('fallbacks disabled:', err.message);
    return out;
  }
}

function textOf(message) {
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

/** שיחה זורמת עם איגור. onText מקבל כל קטע טקסט חדש. מחזיר את הטקסט המלא. */
export async function streamChat({ system, messages, onText, effort = 'medium', signal }) {
  if (MOCK) return mock.streamChat({ messages, onText });
  return callWithFallbackRetry(async (useFallback) => {
    const { api, params } = withFallback({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort },
    }, useFallback);
    const stream = api.stream(params, { signal });
    stream.on('text', (delta) => onText(delta));
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      onText('\n\n' + REFUSAL_TEXT);
      return textOf(final) + '\n\n' + REFUSAL_TEXT;
    }
    return textOf(final);
  });
}

/** קריאה שמחזירה JSON לפי סכמה (structured outputs). */
export async function jsonCall({ system, content, schema, effort = 'medium', maxTokens = 16000, mockKind }) {
  if (MOCK) return mock.json(mockKind, content);
  return callWithFallbackRetry(async (useFallback) => {
    const { api, params } = withFallback({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema } },
    }, useFallback);
    const stream = api.stream(params);
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new Error('refusal');
    return JSON.parse(textOf(final));
  });
}

export async function textCall({ system, content, effort = 'low', mockKind }) {
  if (MOCK) return mock.text(mockKind);
  return callWithFallbackRetry(async (useFallback) => {
    const { api, params } = withFallback({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort },
    }, useFallback);
    const final = await api.create(params);
    return final.stop_reason === 'refusal' ? '' : textOf(final);
  });
}

// --- פרומפטים -----------------------------------------------------------------
const TOPIC_IDS = ALL_SUBTOPICS.map((s) => s.id);

export const IGOR_CORE = `אתה "איגור" – מורה פרטי למתמטיקה ומלווה אישי של תלמידה בכיתה י' בתיכון בתל אביב, שלומדת 4 יחידות לימוד (תוכנית הלימודים החדשה של משרד החינוך, שאלון 471). היא מתקשה במתמטיקה, ולפעמים קשה לה להתרכז מול מסך לאורך זמן.

## מי אתה
- חם, חברי, צעיר ומצחיק במידה – אבל מקצועי, מדויק ואמין. כמו אח גדול שממש טוב במתמטיקה.
- אתה מדבר עברית טבעית ועכשווית. פונים אליה בלשון נקבה ("את", "בואי", "נסי"). על עצמך אתה מדבר בלשון זכר.
- אתה סבלני בלי גבול. אין שאלה טיפשית. טעות היא חלק מהלמידה – אף פעם לא נוזפים, לא מאוכזבים, לא "זה פשוט".
- אתה בונה ביטחון: מציין משהו טוב שהיא עשתה לפני שמתקנים, וחוגג הצלחות קטנות.

## איך אתה מלמד (הכי חשוב)
1. **לא פותרים במקומה.** כשהיא מביאה תרגיל (במיוחד שיעורי בית) – אל תיתן את הפתרון המלא מיד. תנחה אותה צעד-צעד: שאל מה היא כבר יודעת, תן רמז קטן, ותן לה לעשות את הצעד.
2. **סולם הרמזים:** רמז עדין → רמז ממוקד → הצעד הבא בפועל → פתרון מלא. מטפסים בסולם רק כשהיא מבקשת או נתקעת. פתרון מלא נותנים כשהיא מבקשת במפורש אחרי שניסתה, או כשהיא כבר פתרה ורוצה לבדוק.
3. **צעד אחד בכל הודעה.** הודעות קצרות: בדרך כלל 2–6 שורות. בלי קירות טקסט. בכל הודעה – רעיון אחד.
4. **סיים כמעט תמיד בשאלה קטנה או במשימה קטנה** שהיא יכולה לעשות עכשיו ("נסי לחשב את השיפוע ותכתבי לי מה יצא").
5. **הסברים מעשיים:** השתמש בדוגמאות מהחיים ומתחומי העניין שלה כשזה טבעי. השתמש באנלוגיות פשוטות לפני הגדרות פורמליות.
6. **בדוק הבנה:** אחרי שהיא פותרת – בקש ממנה להסביר במילים שלה למה, או תן "תרגיל תאום" (אותו רעיון, מספרים אחרים).
7. **אם היא כותבת "לא הבנתי"** – הסבר בדרך אחרת לגמרי (ציור במילים, דוגמה מספרית, אנלוגיה), לא אותו הסבר במילים אחרות.
8. **עודד עבודה על דף:** מומלץ שתפתור במחברת ותצלם – זה טוב לריכוז ולזיכרון, ופחות זמן מסך.
9. **התאם לשיטה של המורה בכיתה:** אם יש סימונים או שיטות מהמחברת שלה (מופיעים בהקשר למטה) – השתמש בהם.
10. **דיוק:** בדוק כל חישוב פעמיים לפני שאתה כותב. אם צילום לא ברור – אמור מה לא ברור ובקש צילום נוסף, אל תנחש.
11. **ריכוז:** אם השיחה ארוכה מאוד או שהיא נשמעת מתוסכלת/עייפה – הצע הפסקה קצרה (לקום, לשתות מים) בעדינות.

## פורמט
- Markdown קצר. מודגש לרעיון המרכזי. רשימות קצרות כשצריך.
- **כל** ביטוי מתמטי ב-LaTeX: בתוך שורה $...$ ובשורה נפרדת $$...$$. לדוגמה: $y = 2x + 3$, $\\frac{3}{4}$, $x^2$, $\\sqrt{5}$.
- אל תשתמש בכותרות גדולות (#). אימוג'י אחד-שניים מקסימום להודעה, לא חובה.
- כשמתאים להראות גרף, תאר אותו במילים ועודד אותה לפתוח את "מעבדת הגרפים" באפליקציה.

## גבולות
- אתה מתמקד במתמטיקה ובלמידה. על נושאים אחרים ענה בקצרה ובחביבות והחזר למתמטיקה.
- אם היא משתפת במצוקה רגשית אמיתית (לא רק תסכול מתרגיל) – הגב בחום, עודד אותה לדבר עם הורה, יועצת בית הספר או מבוגר שהיא סומכת עליו, ואם יש סכנה – ער"ן 1201 או סה"ר.
- אל תבקש פרטים מזהים (כתובת, טלפון וכו').`;

const MODE_INSTRUCTIONS = {
  chat: 'מצב: שאלה חופשית. עזור לה במה שהיא שואלת לפי כללי ההוראה.',
  homework: `מצב: שיעורי בית. היא צילמה או כתבה תרגיל משיעורי הבית.
- התחל בלזהות בקצרה על מה התרגיל (נושא) ומה מבקשים – במילים פשוטות.
- אם יש כמה סעיפים/תרגילים – שאל במה מתחילים, או התחל מהראשון.
- אל תיתן את התשובה הסופית. הנחה צעד-צעד, היא עושה את העבודה.
- כשהיא מסיימת סעיף – שבח ספציפי, ובדוק שהיא מבינה למה.`,
  check: `מצב: בדיקת פתרון. היא צילמה פתרון שכתבה בעצמה.
- קרא את הפתרון שלה בעיון, שורה אחרי שורה.
- אם הכל נכון – תגיד! ספציפית מה היה טוב.
- אם יש טעות: ציין קודם מה נכון, ואז הצבע על **השורה הראשונה** שבה יש טעות ("בשורה 3, כשעברת אגף...") ושאל שאלה שתעזור לה למצוא את הטעות בעצמה, במקום לתקן במקומה.`,
  topic: 'מצב: הסבר נושא. היא רוצה להבין נושא. התחל מהאינטואיציה ומדוגמה פשוטה, ואז תרגיל קטן. לא יותר מרעיון אחד בהודעה.',
  mistake: 'מצב: מחברת הטעויות. היא חוזרת לתרגיל שבו טעתה. עזור לה להבין את הטעות (מה הייתה המחשבה השגויה), ואז תן תרגיל תאום קצר.',
  practice: 'מצב: עזרה בתרגיל מתוך תרגול. אל תגלה את התשובה מיד – עזור לה להגיע אליה.',
  exam: 'מצב: הכנה למבחן. עזור לה לחזור על החומר בצורה ממוקדת, תן טיפים למבחן (ניהול זמן, לקרוא את השאלה עד הסוף, לבדוק) ותרגילים בסגנון מבחן.',
  note: 'מצב: שאלה על שיעור מהכיתה. יש לך את סיכום השיעור והצילומים. הסבר בהתאם למה שנלמד בכיתה ובסימונים של המורה.',
};

const MASTERY_WORDS = (s) => (s >= 80 ? 'שולטת' : s >= 55 ? 'בדרך הנכונה' : s >= 25 ? 'צריך חיזוק' : 'עוד לא תרגלה/קשה');

/** הקשר אישי – מתעדכן, ולכן מגיע אחרי החלק הקבוע (בשביל prompt caching). */
export function studentContext({ profile, mastery = [], exams = [], notations = [], mistakesTopics = [] }) {
  const lines = [];
  lines.push(`שם התלמידה: ${profile.name || 'התלמידה'}.`);
  if (profile.interests) lines.push(`תחומי עניין שלה (לדוגמאות): ${profile.interests}.`);
  if (profile.currentTopic) {
    const t = ALL_SUBTOPICS.find((s) => s.id === profile.currentTopic);
    if (t) lines.push(`מה לומדים עכשיו בכיתה: ${t.unitTitle} – ${t.title}.`);
  }
  const named = mastery
    .map((m) => ({ ...m, t: ALL_SUBTOPICS.find((s) => s.id === m.topic_id) }))
    .filter((m) => m.t);
  const weak = named.filter((m) => m.score < 55).slice(0, 6);
  const strong = named.filter((m) => m.score >= 80).slice(0, 6);
  if (weak.length) lines.push(`נושאים שצריכים חיזוק: ${weak.map((m) => `${m.t.title} (${MASTERY_WORDS(m.score)})`).join(', ')}.`);
  if (strong.length) lines.push(`נושאים שהיא כבר שולטת בהם (אפשר להישען עליהם): ${strong.map((m) => m.t.title).join(', ')}.`);
  if (mistakesTopics.length) lines.push(`טעויות חוזרות לאחרונה בנושאים: ${mistakesTopics.join(', ')}.`);
  if (exams.length) lines.push(`מבחנים קרובים: ${exams.map((e) => `${e.title} בתאריך ${e.date}`).join('; ')}.`);
  if (notations.length) lines.push(`סימונים ושיטות של המורה בכיתה (מתוך צילומי המחברת):\n${notations.map((n) => '- ' + n).join('\n')}`);
  return lines.join('\n');
}

export function tutorSystem({ mode, context, convoContext }) {
  const blocks = [
    { type: 'text', text: IGOR_CORE, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `## הקשר על התלמידה\n${context}\n\n## ${MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.chat}${convoContext ? `\n\nהקשר נוסף לשיחה הזו:\n${convoContext}` : ''}` },
  ];
  return blocks;
}

// --- סכמות ------------------------------------------------------------------
const QUESTION_PROPS = {
  prompt: { type: 'string', description: 'נוסח השאלה בעברית, עם LaTeX בתוך $...$' },
  answer_type: { type: 'string', enum: ['number', 'numbers', 'choice', 'expression'] },
  choices: { type: 'array', items: { type: 'string' }, description: 'רק לשאלת בחירה (choice): 4 אפשרויות. אחרת מערך ריק.' },
  answer: { type: 'string', description: 'number: מספר אחד (אפשר שבר 3/4). numbers: מספרים מופרדים בפסיק. choice: הטקסט המדויק של האפשרות הנכונה. expression: הביטוי/התשובה הנכונה.' },
  hints: { type: 'array', items: { type: 'string' }, description: '2-3 רמזים מדורגים, מהעדין לממוקד, בלי לגלות את התשובה' },
  solution: { type: 'string', description: 'פתרון מלא צעד-אחר-צעד, קצר וברור, עם LaTeX' },
  difficulty: { type: 'integer', description: '1 קל, 2 בינוני, 3 מאתגר (רמת בגרות)' },
  skill: { type: 'string', description: 'המיומנות הספציפית' },
};
const QUESTION_SCHEMA = { type: 'object', properties: QUESTION_PROPS, required: Object.keys(QUESTION_PROPS), additionalProperties: false };

const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: { questions: { type: 'array', items: { ...QUESTION_SCHEMA, properties: { ...QUESTION_PROPS, topic_id: { type: 'string', enum: TOPIC_IDS } }, required: [...Object.keys(QUESTION_PROPS), 'topic_id'] } } },
  required: ['questions'],
  additionalProperties: false,
};

const GENERATOR_SYSTEM = `אתה כותב תרגילים במתמטיקה לתלמידת כיתה י', 4 יחידות (תוכנית חדשה, שאלון 471), בעברית תקנית ופשוטה, בלשון נקבה.
כללים:
- כל תרגיל חייב להיות נכון מתמטית – פתור כל תרגיל בעצמך ובדוק את התשובה לפני שאתה כותב אותה.
- מספרים "נחמדים" (תשובות שלמות או שברים פשוטים) כשאפשר, כדי שהקושי יהיה ברעיון ולא בחישוב.
- נוסח קצר וברור. מבחן ריכוז: שאלה שאפשר לקרוא ב-10 שניות.
- העדף answer_type מסוג number/numbers/choice (בדיקה אוטומטית). expression רק כשבאמת צריך ביטוי.
- בשאלות choice – מסיחים שמבוססים על טעויות נפוצות אמיתיות.
- גיוון: לא אותה תבנית שוב ושוב. שלב לפעמים הקשר מהחיים ומתחומי העניין שלה.
- LaTeX בתוך $...$ לכל ביטוי מתמטי. בלי גרפים/ציורים – אם צריך צורה, תאר אותה במילים (קודקודים, אורכים).`;

export async function generateQuestions({ topicIds, count = 5, difficulty = 2, profile, purpose = 'practice', extraContext = '', avoid = [] }) {
  const topics = topicIds.map((id) => ALL_SUBTOPICS.find((s) => s.id === id)).filter(Boolean);
  const purposeText = {
    practice: 'תרגול רגיל. התחל קל ועלה בהדרגה.',
    diagnostic: 'אבחון פתיחה: תרגיל אחד לכל נושא, ברמה בסיסית-בינונית, כדי לגלות פערים. בלי טריקים.',
    review: 'חזרה על נושא שבו היו טעויות – תרגילים שבודקים את אותה מיומנות במספרים אחרים.',
    twin: 'תרגיל תאום: אותו רעיון בדיוק כמו התרגיל שבהקשר, מספרים אחרים.',
  }[purpose];
  const content = `צור ${count} תרגילים.
מטרה: ${purposeText}
רמת קושי מבוקשת: ${difficulty} (1-3).
נושאים: ${topics.map((t) => `[${t.id}] ${t.unitTitle} → ${t.title}: ${t.skills.join(', ')}`).join('\n')}
${profile?.interests ? `תחומי עניין של התלמידה: ${profile.interests}` : ''}
${extraContext ? `הקשר:\n${extraContext}` : ''}
${avoid.length ? `אל תחזור על התרגילים האלה:\n${avoid.slice(0, 15).join('\n')}` : ''}`;
  const out = await jsonCall({ system: GENERATOR_SYSTEM, content, schema: QUESTIONS_SCHEMA, effort: 'medium', mockKind: 'questions' });
  return out.questions.map((q) => ({ ...q, difficulty: Math.min(3, Math.max(1, q.difficulty || difficulty)) }));
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    correct: { type: 'boolean' },
    feedback: { type: 'string', description: 'משוב קצר וחם בעברית (1-2 משפטים) בלשון נקבה, עם LaTeX. אם שגוי – רמז לכיוון, בלי לגלות את התשובה.' },
  },
  required: ['correct', 'feedback'],
  additionalProperties: false,
};

export async function checkWithAI({ question, studentAnswer }) {
  const content = `שאלה: ${question.prompt}
התשובה הנכונה: ${question.answer}
התשובה של התלמידה: ${studentAnswer}
האם התשובה שלה נכונה מתמטית (גם אם כתובה בצורה שקולה אחרת, למשל סדר שונה, שבר מצומצם/לא מצומצם, רווחים)?`;
  return jsonCall({
    system: 'אתה בודק תשובות במתמטיקה של תלמידת כיתה י\'. היה מדויק: שקילות מתמטית = נכון. שגיאת כתיב קטנה בכתיבת ביטוי שלא משנה את המשמעות = נכון.',
    content,
    schema: CHECK_SCHEMA,
    effort: 'low',
    maxTokens: 4000,
    mockKind: 'check',
  });
}

const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['explain', 'example', 'try', 'tip'] },
          title: { type: 'string' },
          body: { type: 'string', description: 'Markdown קצר (עד ~70 מילים) עם LaTeX' },
          question: { type: 'string', description: 'רק בכרטיס try: נוסח שאלה קצרה. אחרת ריק.' },
          answer_type: { type: 'string', enum: ['number', 'numbers', 'choice', 'expression', 'none'] },
          choices: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          hint: { type: 'string' },
          solution: { type: 'string' },
        },
        required: ['kind', 'title', 'body', 'question', 'answer_type', 'choices', 'answer', 'hint', 'solution'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'cards'],
  additionalProperties: false,
};

export async function generateLesson({ topicId, profile, notesContext = '', variant = false }) {
  const t = ALL_SUBTOPICS.find((s) => s.id === topicId);
  const content = `בנה שיעור קצר ואינטראקטיבי (6-9 כרטיסים) על: ${t.unitTitle} → ${t.title}.
מיומנויות: ${t.skills.join(', ')}.
מבנה: פתיחה אינטואיטיבית (למה זה מעניין/איפה זה בחיים) → הסבר קצר → דוגמה פתורה → "נסי בעצמך" → הסבר/מקרה נוסף → דוגמה → "נסי בעצמך" → טיפ למבחן/טעות נפוצה → "נסי בעצמך" אחרון קצת יותר מאתגר.
כרטיס explain/example/tip: answer_type='none', שדות שאלה ריקים. כרטיס try: answer_type מסוג number/numbers/choice עדיף.
כל כרטיס קצר! זו תלמידה שקשה לה להתרכז זמן רב – משפטים קצרים, רעיון אחד בכרטיס.
${profile?.interests ? `שלב דוגמה מתחומי העניין שלה: ${profile.interests}` : ''}
${notesContext ? `כך המורה לימד את זה בכיתה (התאם סימונים ושיטה):\n${notesContext}` : ''}
${variant ? 'היא ביקשה הסבר אחר מהקודם – השתמש בגישה ובדוגמאות שונות לגמרי.' : ''}`;
  return jsonCall({ system: IGOR_CORE + '\n\nעכשיו אתה כותב שיעור קצר בפורמט כרטיסים.', content, schema: LESSON_SCHEMA, effort: 'medium', mockKind: 'lesson' });
}

const NOTE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'כותרת קצרה לשיעור' },
    topic_id: { type: 'string', enum: [...TOPIC_IDS, 'other'] },
    summary: { type: 'string', description: 'סיכום ברור של מה שנלמד, ב-Markdown עם LaTeX, כולל ההגדרות, הנוסחאות והדוגמאות מהלוח/מחברת. בלשון נקבה כשפונים אליה.' },
    notation: { type: 'string', description: 'סימונים, מינוחים ושיטות ייחודיים של המורה (למשל איך כותבים נקודת קודקוד, שיטת פירוק מועדפת). שורה קצרה לכל אחד. ריק אם אין.' },
    unclear: { type: 'string', description: 'מה לא היה קריא בצילום, אם בכלל. אחרת ריק.' },
  },
  required: ['title', 'topic_id', 'summary', 'notation', 'unclear'],
  additionalProperties: false,
};

export async function analyzeNote({ uploadIds, hint = '' }) {
  const content = userContent(
    `אלה צילומים מהשיעור בכיתה (מחברת, לוח או דף עבודה). ${hint ? `התלמידה כתבה: ${hint}` : ''}
זהה את הנושא מתוך תוכנית הלימודים, וכתוב סיכום מסודר שיעזור לה לחזור על השיעור.`,
    uploadIds,
  );
  return jsonCall({ system: 'אתה איגור, מורה פרטי למתמטיקה לכיתה י\' 4 יח"ל. אתה מנתח צילומים של חומר מהכיתה בדיוק רב.', content, schema: NOTE_SCHEMA, effort: 'medium', mockKind: 'note' });
}

const EXAM_INFO_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    date: { type: 'string', description: 'YYYY-MM-DD או ריק אם לא מופיע' },
    topic_ids: { type: 'array', items: { type: 'string', enum: TOPIC_IDS } },
    notes: { type: 'string', description: 'דגשים מהמורה (חומרי עזר, דפי נוסחאות, משך המבחן)' },
  },
  required: ['title', 'date', 'topic_ids', 'notes'],
  additionalProperties: false,
};

export async function extractExamInfo({ uploadIds, text = '' }) {
  const content = userContent(`זו הודעה/דף על מבחן קרוב. חלץ: שם המבחן, תאריך, ואילו נושאים מתוכנית הלימודים נכללים. השנה הנוכחית: ${new Date().getFullYear()}. ${text}`, uploadIds);
  return jsonCall({ system: 'אתה מחלץ מידע על מבחני מתמטיקה של כיתה י\' 4 יח"ל.', content, schema: EXAM_INFO_SCHEMA, effort: 'low', mockKind: 'examInfo' });
}

const MOCK_EXAM_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic_id: { type: 'string', enum: TOPIC_IDS },
          intro: { type: 'string', description: 'נתוני השאלה (Markdown + LaTeX)' },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'א, ב, ג...' },
                prompt: { type: 'string' },
                points: { type: 'integer' },
                answer: { type: 'string', description: 'תשובה סופית נכונה' },
                solution: { type: 'string', description: 'פתרון מלא מקוצר' },
              },
              required: ['label', 'prompt', 'points', 'answer', 'solution'],
              additionalProperties: false,
            },
          },
        },
        required: ['topic_id', 'intro', 'parts'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

export async function generateMockExam({ topicIds, minutes, profile, notesContext = '' }) {
  const topics = topicIds.map((id) => ALL_SUBTOPICS.find((s) => s.id === id)).filter(Boolean);
  const content = `כתוב מבחן דמה בסגנון מבחן כיתתי/בגרות 4 יח"ל (שאלון 471) למשך ${minutes} דקות.
נושאים: ${topics.map((t) => `[${t.id}] ${t.title}`).join(', ')}.
3-5 שאלות, כל שאלה עם 2-4 סעיפים שנבנים זה על זה (כמו בבגרות). סך הנקודות = 100.
התחל בשאלה נגישה כדי לבנות ביטחון. מספרים נחמדים. בדוק כל תשובה.
${notesContext ? `כך הנושאים נלמדו בכיתה:\n${notesContext}` : ''}`;
  return jsonCall({ system: GENERATOR_SYSTEM, content, schema: MOCK_EXAM_SCHEMA, effort: 'high', mockKind: 'mockExam' });
}

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          score: { type: 'number' },
          max: { type: 'number' },
          feedback: { type: 'string', description: 'משוב קצר בלשון נקבה: מה טוב, ואיפה הטעות אם יש' },
        },
        required: ['label', 'score', 'max', 'feedback'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string', description: 'משפט-שניים מעודדים ומה לחזק' },
  },
  required: ['parts', 'summary'],
  additionalProperties: false,
};

export async function gradeMockQuestion({ question, answerText, uploadIds }) {
  const content = userContent(
    `שאלה ממבחן דמה:
${question.intro}
${question.parts.map((p) => `סעיף ${p.label} (${p.points} נק'): ${p.prompt}\nתשובה נכונה: ${p.answer}\nפתרון: ${p.solution}`).join('\n\n')}

הפתרון של התלמידה ${uploadIds.length ? '(בצילום/ים המצורפים)' : ''}:
${answerText || '(ראה צילום)'}

בדוק כמו מורה הוגן: ניקוד חלקי על דרך נכונה גם אם יש טעות חישוב. אם סעיף לא נענה – 0.`,
    uploadIds,
  );
  return jsonCall({ system: 'אתה בודק מבחן במתמטיקה לכיתה י\' 4 יח"ל. הוגן, מדויק ומעודד.', content, schema: GRADE_SCHEMA, effort: 'medium', mockKind: 'grade' });
}

export async function parentSummary({ stats }) {
  const content = `כתוב להורה סיכום שבועי קצר (4-6 משפטים) בעברית על הלמידה של הבת במתמטיקה, על בסיס הנתונים. טון חיובי, ענייני וכן: מה הלך טוב, מה עדיין קשה, והמלצה אחת קונקרטית איך ההורה יכול לעזור (בלי לחץ). אל תמציא נתונים.
נתונים: ${JSON.stringify(stats)}`;
  return textCall({ system: 'אתה איגור, המורה הפרטי למתמטיקה. אתה כותב להורים בקצרה ובכבוד.', content, effort: 'low', mockKind: 'parent' });
}

export function convoTitle(text) {
  const clean = (text || '').replace(/\$[^$]*\$/g, '…').replace(/\s+/g, ' ').trim();
  return clean.length > 40 ? clean.slice(0, 40) + '…' : clean || 'שיחה חדשה';
}

export const AnthropicError = Anthropic.APIError;
