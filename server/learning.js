import { one, all, run, today, addDays, daysBetween, getProfile } from './db.js';
import { ALL_SUBTOPICS, findSubtopic, UNITS } from '../shared/curriculum.js';
export { checkLocally, parseNumber } from '../shared/check.js';

// --- שליטה בנושא ------------------------------------------------------------------
export function updateMastery(userId, topicId, correct, hintsUsed = 0) {
  const row = one('SELECT * FROM mastery WHERE user_id = ? AND topic_id = ?', userId, topicId);
  let score = row ? row.score : 20;
  if (correct) score += (100 - score) * Math.max(0.06, 0.2 - hintsUsed * 0.05);
  else score -= score * 0.12;
  score = Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
  run(
    `INSERT INTO mastery (user_id, topic_id, score, attempts, last_at) VALUES (?, ?, ?, 1, datetime('now'))
     ON CONFLICT(user_id, topic_id) DO UPDATE SET score = excluded.score, attempts = attempts + 1, last_at = excluded.last_at`,
    userId, topicId, score,
  );
  return score;
}

export function masteryMap(userId) {
  const rows = all('SELECT topic_id, score, attempts, last_at FROM mastery WHERE user_id = ?', userId);
  return Object.fromEntries(rows.map((r) => [r.topic_id, r]));
}

// --- חזרה מרווחת (מחברת טעויות) -------------------------------------------------
const INTERVALS = [1, 3, 7, 14, 30];

export function addMistake(userId, topicId, question, wrongAnswer) {
  const exists = one('SELECT id FROM mistakes WHERE user_id = ? AND resolved = 0 AND question = ?', userId, JSON.stringify(question));
  if (exists) {
    run('UPDATE mistakes SET box = 0, due_at = ?, wrong_answer = ? WHERE id = ?', addDays(today(), 1), wrongAnswer ?? '', exists.id);
    return exists.id;
  }
  return run('INSERT INTO mistakes (user_id, topic_id, question, wrong_answer, due_at) VALUES (?, ?, ?, ?, ?)', userId, topicId, JSON.stringify(question), wrongAnswer ?? '', addDays(today(), 1)).lastInsertRowid;
}

export function reviewMistake(userId, mistakeId, correct) {
  const m = one('SELECT * FROM mistakes WHERE id = ? AND user_id = ?', mistakeId, userId);
  if (!m) return null;
  if (correct) {
    const box = m.box + 1;
    if (box >= INTERVALS.length) run('UPDATE mistakes SET resolved = 1, box = ? WHERE id = ?', box, m.id);
    else run('UPDATE mistakes SET box = ?, due_at = ? WHERE id = ?', box, addDays(today(), INTERVALS[box]), m.id);
  } else {
    run('UPDATE mistakes SET box = 0, due_at = ? WHERE id = ?', addDays(today(), 1), m.id);
  }
  return one('SELECT * FROM mistakes WHERE id = ?', m.id);
}

export function dueMistakes(userId, limit = 50) {
  return all('SELECT * FROM mistakes WHERE user_id = ? AND resolved = 0 AND due_at <= ? ORDER BY due_at LIMIT ?', userId, today(), limit).map(parseMistake);
}

export function parseMistake(m) {
  return { ...m, question: JSON.parse(m.question) };
}

// --- פעילות, XP ורצף ------------------------------------------------------------------
export function addActivity(userId, { minutes = 0, xp = 0 }) {
  run(
    `INSERT INTO activity (user_id, day, minutes, xp) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET minutes = minutes + excluded.minutes, xp = xp + excluded.xp`,
    userId, today(), minutes, xp,
  );
}

export function streakInfo(userId) {
  const rows = all('SELECT day, minutes, xp FROM activity WHERE user_id = ? AND (xp > 0 OR minutes >= 3) ORDER BY day DESC LIMIT 400', userId);
  const days = new Set(rows.map((r) => r.day));
  // רצף "סלחני": יום אחד חסר לא שובר את הרצף (כמו "הקפאה" אוטומטית)
  let streak = 0;
  let missed = 0;
  let d = days.has(today()) ? today() : addDays(today(), -1);
  for (let i = 0; i < 400; i++) {
    if (days.has(d)) {
      streak++;
      missed = 0;
    } else if (++missed > 1) break;
    d = addDays(d, -1);
  }
  const totalXp = one('SELECT COALESCE(SUM(xp),0) AS xp FROM activity WHERE user_id = ?', userId).xp;
  const todayRow = one('SELECT minutes, xp FROM activity WHERE user_id = ? AND day = ?', userId, today()) || { minutes: 0, xp: 0 };
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today(), -i);
    const r = rows.find((x) => x.day === day);
    week.push({ day, minutes: r?.minutes || 0, xp: r?.xp || 0, active: days.has(day) });
  }
  const level = Math.floor(Math.sqrt(totalXp / 50)) + 1;
  const levelFloor = (level - 1) ** 2 * 50;
  const levelCeil = level ** 2 * 50;
  return { streak, totalXp, level, levelProgress: (totalXp - levelFloor) / (levelCeil - levelFloor), today: todayRow, week };
}

// --- תוכנית יומית ------------------------------------------------------------------------
export function upcomingExams(userId) {
  return all('SELECT * FROM exams WHERE user_id = ? AND date >= ? ORDER BY date', userId, today()).map(parseExam);
}

export function parseExam(e) {
  return { ...e, topic_ids: JSON.parse(e.topic_ids), plan: JSON.parse(e.plan) };
}

function weakestTopic(userId, candidates) {
  const m = masteryMap(userId);
  const list = (candidates?.length ? candidates : ALL_SUBTOPICS.map((s) => s.id)).map((id) => ({ id, score: m[id]?.score ?? -1, last: m[id]?.last_at || '' }));
  // קודם נושאים שתורגלו וחלשים, אחר כך כאלה שלא תורגלו בכלל
  const practiced = list.filter((x) => x.score >= 0 && x.score < 70).sort((a, b) => a.score - b.score);
  if (practiced.length) return practiced[0].id;
  const fresh = list.filter((x) => x.score < 0);
  return (fresh[0] || list.sort((a, b) => a.last.localeCompare(b.last))[0]).id;
}

export function buildDailyPlan(userId) {
  const existing = one('SELECT tasks FROM daily_plans WHERE user_id = ? AND day = ?', userId, today());
  if (existing) return JSON.parse(existing.tasks);

  const profile = getProfile(userId);
  const tasks = [];
  const due = dueMistakes(userId, 5);
  if (due.length) tasks.push({ id: 'review', type: 'review', title: 'חזרה חכמה על טעויות', subtitle: `${due.length} תרגילים שחוזרים לביקור`, minutes: 3, done: false });

  const exam = upcomingExams(userId).find((e) => daysBetween(today(), e.date) <= 14);
  if (exam) {
    const todayItem = exam.plan.find((p) => p.day === today());
    if (todayItem) {
      tasks.push({ id: 'exam', type: todayItem.type === 'mock' ? 'mock' : 'practice', topicId: todayItem.topicId, examId: exam.id, title: `הכנה ל${exam.title}`, subtitle: todayItem.label, minutes: todayItem.type === 'mock' ? 30 : 8, done: false });
    }
  }

  const focus = profile.currentTopic || weakestTopic(userId);
  const focusT = findSubtopic(focus);
  if (focusT && !tasks.some((t) => t.topicId === focus)) {
    const m = masteryMap(userId)[focus];
    if (!m || m.attempts < 3) tasks.push({ id: 'lesson', type: 'lesson', topicId: focus, title: `שיעור קצר: ${focusT.title}`, subtitle: 'הסבר בכרטיסים + תרגילים קטנים', minutes: 5, done: false });
    tasks.push({ id: 'practice', type: 'practice', topicId: focus, title: `תרגול: ${focusT.title}`, subtitle: profile.currentTopic ? 'מה שלומדים עכשיו בכיתה' : 'הנושא שהכי שווה לחזק', minutes: 6, done: false });
  }

  if (tasks.length < 3) {
    const extra = weakestTopic(userId, ALL_SUBTOPICS.filter((s) => s.id !== focus && s.unitId === 'foundations').map((s) => s.id));
    const t = findSubtopic(extra);
    if (t) tasks.push({ id: 'warmup', type: 'practice', topicId: extra, title: `חיזוק יסודות: ${t.title}`, subtitle: '3 תרגילים קצרים', minutes: 3, count: 3, done: false });
  }

  run('INSERT OR REPLACE INTO daily_plans (user_id, day, tasks) VALUES (?, ?, ?)', userId, today(), JSON.stringify(tasks));
  return tasks;
}

export function markTaskDone(userId, taskId) {
  const tasks = buildDailyPlan(userId).map((t) => (t.id === taskId ? { ...t, done: true } : t));
  run('UPDATE daily_plans SET tasks = ? WHERE user_id = ? AND day = ?', JSON.stringify(tasks), userId, today());
  return tasks;
}

// --- תוכנית הכנה למבחן -------------------------------------------------------------------
export function buildExamPlan(examDate, topicIds, masteries = {}) {
  const start = today();
  const days = Math.max(1, daysBetween(start, examDate));
  const plan = [];
  // הנושאים החלשים קודם
  const ordered = [...topicIds].sort((a, b) => (masteries[a]?.score ?? 0) - (masteries[b]?.score ?? 0));
  const studyDays = Math.max(1, days - 1); // היום האחרון לפני המבחן – מבחן דמה
  for (let i = 0; i < studyDays && i < 21; i++) {
    const topicId = ordered[i % ordered.length];
    const t = findSubtopic(topicId);
    const round = Math.floor(i / ordered.length);
    plan.push({ day: addDays(start, i), type: round === 0 ? 'learn' : 'practice', topicId, label: `${round === 0 ? 'לחזור ולתרגל' : 'עוד סיבוב תרגול'}: ${t?.title || ''}`, done: false });
  }
  plan.push({ day: addDays(examDate, -1) >= start ? addDays(examDate, -1) : start, type: 'mock', topicId: ordered[0], label: 'מבחן דמה + חזרה על טעויות', done: false });
  return plan;
}

export function unitProgress(userId) {
  const m = masteryMap(userId);
  return UNITS.map((u) => {
    const subs = u.subtopics.map((s) => ({ id: s.id, title: s.title, score: m[s.id]?.score ?? null, attempts: m[s.id]?.attempts || 0 }));
    const practiced = subs.filter((s) => s.score !== null);
    const avg = subs.reduce((a, s) => a + (s.score || 0), 0) / subs.length;
    return { id: u.id, title: u.title, emoji: u.emoji, color: u.color, score: Math.round(avg), practiced: practiced.length, total: subs.length, subtopics: subs };
  });
}
