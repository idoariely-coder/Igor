import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { one, all, run, UPLOAD_DIR, getProfile, setProfile, today, daysBetween } from './db.js';
import * as ai from './ai.js';
import * as L from './learning.js';
import * as push from './push.js';
import { DIAGNOSTIC_TOPICS, findSubtopic } from '../shared/curriculum.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '../dist');
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// --- עזרים ------------------------------------------------------------------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(pin), salt, 32).toString('hex')}`;
}
function verifyPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

function publicUser(u) {
  const p = JSON.parse(u.profile || '{}');
  return { id: u.id, name: u.name, role: u.role, avatar: p.avatar || null };
}

function auth(req, res, next) {
  const token = req.cookies.igor_session;
  const row = token && one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token);
  if (!row) return res.status(401).json({ error: 'not_logged_in' });
  req.user = { id: row.id, name: row.name, role: row.role, profile: JSON.parse(row.profile) };
  next();
}
const parentOnly = (req, res, next) => (req.user.role === 'parent' ? next() : res.status(403).json({ error: 'parents_only' }));

function studentId() {
  return one("SELECT id FROM users WHERE role = 'student' ORDER BY id LIMIT 1")?.id;
}

const loginAttempts = new Map();

function tutorContext(userId) {
  const profile = { ...getProfile(userId), name: one('SELECT name FROM users WHERE id = ?', userId)?.name };
  const mastery = all('SELECT topic_id, score FROM mastery WHERE user_id = ? ORDER BY score', userId);
  const exams = L.upcomingExams(userId).slice(0, 3);
  const notations = all("SELECT notation FROM notes WHERE user_id = ? AND notation != '' ORDER BY id DESC LIMIT 8", userId).map((n) => n.notation);
  const mistakesTopics = [...new Set(all('SELECT topic_id FROM mistakes WHERE user_id = ? AND resolved = 0 ORDER BY id DESC LIMIT 20', userId).map((m) => findSubtopic(m.topic_id)?.title).filter(Boolean))].slice(0, 5);
  return { profile, text: ai.studentContext({ profile, mastery, exams, notations, mistakesTopics }) };
}

function notesContextFor(userId, topicIds) {
  if (!topicIds?.length) return '';
  const rows = all(`SELECT title, summary, notation FROM notes WHERE user_id = ? AND topic_id IN (${topicIds.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 4`, userId, ...topicIds);
  return rows.map((n) => `### ${n.title}\n${n.summary.slice(0, 1500)}\n${n.notation}`).join('\n\n');
}

// --- התקנה והתחברות ------------------------------------------------------------
app.get('/api/setup-status', (req, res) => {
  const users = all('SELECT * FROM users ORDER BY role DESC, id');
  res.json({ needsSetup: users.length === 0, users: users.map(publicUser), demo: ai.MOCK });
});

app.post('/api/setup', (req, res) => {
  if (one('SELECT id FROM users LIMIT 1')) return res.status(400).json({ error: 'already_setup' });
  const { studentName, studentPin, parentName, parentPin } = req.body || {};
  if (!studentName || !/^\d{4,8}$/.test(studentPin || '') || !/^\d{4,8}$/.test(parentPin || '')) return res.status(400).json({ error: 'invalid' });
  run("INSERT INTO users (name, role, pin_hash) VALUES (?, 'student', ?)", studentName.trim(), hashPin(studentPin));
  run("INSERT INTO users (name, role, pin_hash) VALUES (?, 'parent', ?)", (parentName || 'הורה').trim(), hashPin(parentPin));
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { userId, pin } = req.body || {};
  const key = `${req.ip}:${userId}`;
  const att = loginAttempts.get(key) || { n: 0, until: 0 };
  if (att.until > Date.now()) return res.status(429).json({ error: 'too_many', wait: Math.ceil((att.until - Date.now()) / 1000) });
  const u = one('SELECT * FROM users WHERE id = ?', userId);
  if (!u || !verifyPin(pin, u.pin_hash)) {
    att.n++;
    if (att.n >= 5) Object.assign(att, { n: 0, until: Date.now() + 60_000 });
    loginAttempts.set(key, att);
    return res.status(401).json({ error: 'wrong_pin' });
  }
  loginAttempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', token, u.id);
  res.cookie('igor_session', token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 400 * 86400000 });
  res.json({ user: publicUser(u) });
});

app.post('/api/logout', auth, (req, res) => {
  run('DELETE FROM sessions WHERE token = ?', req.cookies.igor_session);
  res.clearCookie('igor_session');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, role: req.user.role }, profile: req.user.profile, demo: ai.MOCK });
});

const PROFILE_FIELDS = ['avatar', 'interests', 'currentTopic', 'onboarded', 'reminderTime', 'dailyLimit', 'voice', 'extraTime', 'focusMinutes', 'theme'];
app.patch('/api/me/profile', auth, (req, res) => {
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => PROFILE_FIELDS.includes(k)));
  if (typeof req.body?.name === 'string' && req.body.name.trim()) run('UPDATE users SET name = ? WHERE id = ?', req.body.name.trim(), req.user.id);
  res.json({ profile: setProfile(req.user.id, patch) });
});

app.post('/api/me/pin', auth, (req, res) => {
  const { oldPin, newPin } = req.body || {};
  const u = one('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!verifyPin(oldPin, u.pin_hash)) return res.status(401).json({ error: 'wrong_pin' });
  if (!/^\d{4,8}$/.test(newPin || '')) return res.status(400).json({ error: 'invalid' });
  run('UPDATE users SET pin_hash = ? WHERE id = ?', hashPin(newPin), u.id);
  res.json({ ok: true });
});

// --- העלאות -------------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

app.post('/api/uploads', auth, upload.single('file'), (req, res) => {
  if (!req.file || !ALLOWED.includes(req.file.mimetype)) return res.status(400).json({ error: 'bad_file' });
  const id = crypto.randomBytes(12).toString('hex');
  fs.writeFileSync(path.join(UPLOAD_DIR, id), req.file.buffer);
  run('INSERT INTO uploads (id, user_id, mime, kind) VALUES (?, ?, ?, ?)', id, req.user.id, req.file.mimetype, req.body.kind || 'chat');
  res.json({ id, url: `/api/uploads/${id}` });
});

app.get('/api/uploads/:id', auth, (req, res) => {
  const row = one('SELECT * FROM uploads WHERE id = ?', req.params.id);
  if (!row || (row.user_id !== req.user.id && req.user.role !== 'parent')) return res.status(404).end();
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(path.join(UPLOAD_DIR, row.id));
});

// --- דף הבית ------------------------------------------------------------------
app.get('/api/home', auth, (req, res) => {
  const uid = req.user.id;
  const due = L.dueMistakes(uid);
  res.json({
    plan: L.buildDailyPlan(uid),
    streak: L.streakInfo(uid),
    dueCount: due.length,
    exams: L.upcomingExams(uid).slice(0, 3).map((e) => ({ id: e.id, title: e.title, date: e.date, daysLeft: daysBetween(today(), e.date) })),
    recentChats: all('SELECT id, title, mode, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 3', uid),
    profile: req.user.profile,
  });
});

app.post('/api/plan/:taskId/done', auth, (req, res) => {
  res.json({ plan: L.markTaskDone(req.user.id, req.params.taskId) });
});

app.post('/api/activity/heartbeat', auth, (req, res) => {
  const minutes = Math.min(2, Math.max(0, Number(req.body?.minutes) || 1));
  L.addActivity(req.user.id, { minutes });
  res.json({ today: L.streakInfo(req.user.id).today });
});

// --- שיחות עם איגור ---------------------------------------------------------------
app.get('/api/conversations', auth, (req, res) => {
  res.json({ conversations: all('SELECT id, title, mode, topic_id, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100', req.user.id) });
});

app.post('/api/conversations', auth, (req, res) => {
  const { mode = 'chat', topicId = null, context = null, title } = req.body || {};
  const id = run('INSERT INTO conversations (user_id, mode, topic_id, title, context) VALUES (?, ?, ?, ?, ?)', req.user.id, mode, topicId, title || 'שיחה חדשה', context).lastInsertRowid;
  res.json({ conversation: one('SELECT * FROM conversations WHERE id = ?', id) });
});

app.get('/api/conversations/:id', auth, (req, res) => {
  const c = one('SELECT * FROM conversations WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const messages = all('SELECT id, role, text, upload_ids, created_at FROM messages WHERE conversation_id = ? ORDER BY id', c.id).map((m) => ({ ...m, upload_ids: JSON.parse(m.upload_ids) }));
  res.json({ conversation: c, messages });
});

app.delete('/api/conversations/:id', auth, (req, res) => {
  run('DELETE FROM conversations WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/conversations/:id/messages', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const c = one('SELECT * FROM conversations WHERE id = ? AND user_id = ?', req.params.id, uid);
  if (!c) return res.status(404).json({ error: 'not_found' });
  const text = String(req.body?.text || '').slice(0, 6000);
  const uploadIds = (req.body?.uploadIds || []).filter((id) => one('SELECT id FROM uploads WHERE id = ? AND user_id = ?', id, uid));
  if (!text && !uploadIds.length) return res.status(400).json({ error: 'empty' });

  run('INSERT INTO messages (conversation_id, role, text, upload_ids) VALUES (?, ?, ?, ?)', c.id, 'user', text, JSON.stringify(uploadIds));
  const history = all('SELECT role, text, upload_ids FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 40', c.id).reverse();
  while (history.length && history[0].role !== 'user') history.shift();
  const messages = history.map((m) => (m.role === 'user' ? { role: 'user', content: ai.userContent(m.text, JSON.parse(m.upload_ids)) } : { role: 'assistant', content: m.text || '…' }));

  const { text: ctx } = tutorContext(uid);
  const topic = c.topic_id ? `נושא השיחה: ${findSubtopic(c.topic_id)?.unitTitle} → ${findSubtopic(c.topic_id)?.title}` : '';
  const system = ai.tutorSystem({ mode: c.mode, context: ctx, convoContext: [topic, c.context].filter(Boolean).join('\n') });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const abort = new AbortController();
  res.on('close', () => abort.abort());

  let full = '';
  try {
    full = await ai.streamChat({ system, messages, signal: abort.signal, onText: (d) => { full += d; send('delta', { text: d }); } });
  } catch (err) {
    console.error('chat error', err?.status, err?.message);
    if (!abort.signal.aborted) send('error', { message: 'איגור נתקע לרגע 😅 נסי לשלוח שוב.' });
  }
  if (full.trim()) {
    run('INSERT INTO messages (conversation_id, role, text) VALUES (?, ?, ?)', c.id, 'assistant', full);
    const isFirst = one('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?', c.id).n <= 2;
    if (isFirst && c.title === 'שיחה חדשה') run('UPDATE conversations SET title = ? WHERE id = ?', ai.convoTitle(text || (uploadIds.length ? '📸 תרגיל מצולם' : '')), c.id);
    run("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", c.id);
    L.addActivity(uid, { xp: 2 });
  }
  send('done', { title: one('SELECT title FROM conversations WHERE id = ?', c.id).title });
  res.end();
}));

// --- תרגול --------------------------------------------------------------------------
function poolCount(uid, topicId) {
  return one('SELECT COUNT(*) AS n FROM question_pool WHERE user_id = ? AND topic_id = ? AND served = 0', uid, topicId).n;
}
function recentPrompts(uid, topicId) {
  return all('SELECT question FROM question_pool WHERE user_id = ? AND topic_id = ? ORDER BY id DESC LIMIT 15', uid, topicId).map((r) => JSON.parse(r.question).prompt);
}
function insertPool(uid, q, served = 0) {
  return run('INSERT INTO question_pool (user_id, topic_id, difficulty, question, served) VALUES (?, ?, ?, ?, ?)', uid, q.topic_id, q.difficulty, JSON.stringify(q), served).lastInsertRowid;
}

const refilling = new Set();
function refill(uid, topicId, difficulty) {
  const key = `${uid}:${topicId}`;
  if (refilling.has(key) || poolCount(uid, topicId) >= 6) return;
  refilling.add(key);
  ai.generateQuestions({ topicIds: [topicId], count: 6, difficulty, profile: getProfile(uid), avoid: recentPrompts(uid, topicId), extraContext: notesContextFor(uid, [topicId]) })
    .then((qs) => qs.forEach((q) => insertPool(uid, { ...q, topic_id: topicId })))
    .catch((e) => console.error('refill error', e?.message))
    .finally(() => refilling.delete(key));
}

function difficultyFor(uid, topicId) {
  const s = L.masteryMap(uid)[topicId]?.score ?? 0;
  return s >= 70 ? 3 : s >= 35 ? 2 : 1;
}

function publicQuestion(qid, q) {
  return { qid, topic_id: q.topic_id, prompt: q.prompt, answer_type: q.answer_type, choices: q.choices, hints: q.hints, difficulty: q.difficulty, skill: q.skill };
}

app.post('/api/practice/start', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const { topicId, count = 5, purpose = 'practice' } = req.body || {};

  if (purpose === 'review') {
    const due = L.dueMistakes(uid, count);
    return res.json({ questions: due.map((m) => publicQuestion(`m${m.id}`, { ...m.question, topic_id: m.topic_id })) });
  }

  if (purpose === 'diagnostic') {
    const qs = await ai.generateQuestions({ topicIds: DIAGNOSTIC_TOPICS, count: DIAGNOSTIC_TOPICS.length, difficulty: 1, profile: getProfile(uid), purpose: 'diagnostic' });
    return res.json({ questions: qs.map((q) => publicQuestion(`p${insertPool(uid, q, 1)}`, q)) });
  }

  if (!findSubtopic(topicId)) return res.status(400).json({ error: 'bad_topic' });
  const difficulty = difficultyFor(uid, topicId);
  let rows = all('SELECT * FROM question_pool WHERE user_id = ? AND topic_id = ? AND served = 0 ORDER BY ABS(difficulty - ?), id LIMIT ?', uid, topicId, difficulty, count);
  if (rows.length < count) {
    const qs = await ai.generateQuestions({ topicIds: [topicId], count: count - rows.length + 3, difficulty, profile: getProfile(uid), avoid: recentPrompts(uid, topicId), extraContext: notesContextFor(uid, [topicId]) });
    qs.forEach((q) => insertPool(uid, { ...q, topic_id: topicId }));
    rows = all('SELECT * FROM question_pool WHERE user_id = ? AND topic_id = ? AND served = 0 ORDER BY difficulty, id LIMIT ?', uid, topicId, count);
  }
  rows.sort((a, b) => a.difficulty - b.difficulty);
  rows.forEach((r) => run('UPDATE question_pool SET served = 1 WHERE id = ?', r.id));
  setTimeout(() => refill(uid, topicId, difficulty), 50);
  res.json({ questions: rows.map((r) => publicQuestion(`p${r.id}`, JSON.parse(r.question))) });
}));

app.post('/api/practice/prefetch', auth, (req, res) => {
  const { topicId } = req.body || {};
  if (findSubtopic(topicId)) refill(req.user.id, topicId, difficultyFor(req.user.id, topicId));
  res.json({ ok: true });
});

function loadQuestion(uid, qid) {
  if (qid?.startsWith('m')) {
    const m = one('SELECT * FROM mistakes WHERE id = ? AND user_id = ?', qid.slice(1), uid);
    return m ? { ...JSON.parse(m.question), topic_id: m.topic_id, mistakeId: m.id } : null;
  }
  const p = one('SELECT * FROM question_pool WHERE id = ? AND user_id = ?', String(qid).slice(1), uid);
  return p ? JSON.parse(p.question) : null;
}

app.post('/api/practice/check', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const { qid, answer, hintsUsed = 0, final = false, source = 'practice' } = req.body || {};
  const q = loadQuestion(uid, qid);
  if (!q) return res.status(404).json({ error: 'not_found' });

  let correct = L.checkLocally(q, answer);
  let feedback = '';
  if (correct === null) {
    const r = await ai.checkWithAI({ question: q, studentAnswer: answer });
    correct = r.correct;
    feedback = r.feedback;
  }
  const done = correct || final;
  const out = { correct, feedback, done };
  if (done) {
    out.solution = q.solution;
    out.answer = q.answer;
    run('INSERT INTO attempts (user_id, topic_id, question, answer, correct, hints_used, source) VALUES (?, ?, ?, ?, ?, ?, ?)', uid, q.topic_id, JSON.stringify(q), String(answer ?? ''), correct ? 1 : 0, hintsUsed, source);
    out.mastery = L.updateMastery(uid, q.topic_id, correct, hintsUsed);
    if (q.mistakeId) L.reviewMistake(uid, q.mistakeId, correct);
    else if (!correct) out.mistakeId = Number(L.addMistake(uid, q.topic_id, { ...q, topic_id: undefined }, answer));
    out.xp = correct ? Math.max(4, 10 - hintsUsed * 3) : 3;
    L.addActivity(uid, { xp: out.xp });
  }
  res.json(out);
}));

// בדיקת תשובה לשאלה שלא מהמאגר (כרטיסי שיעור)
app.post('/api/practice/check-free', auth, wrap(async (req, res) => {
  const { question, answer } = req.body || {};
  if (!question?.prompt) return res.status(400).json({ error: 'bad' });
  let correct = L.checkLocally(question, answer);
  let feedback = '';
  if (correct === null) ({ correct, feedback } = await ai.checkWithAI({ question, studentAnswer: answer }));
  if (correct) L.addActivity(req.user.id, { xp: 5 });
  res.json({ correct, feedback });
}));

app.post('/api/practice/twin', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const q = loadQuestion(uid, req.body?.qid);
  if (!q) return res.status(404).json({ error: 'not_found' });
  const [twin] = await ai.generateQuestions({ topicIds: [q.topic_id], count: 1, difficulty: q.difficulty, profile: getProfile(uid), purpose: 'twin', extraContext: `התרגיל המקורי: ${q.prompt}\nפתרון: ${q.solution}` });
  const tq = { ...twin, topic_id: q.topic_id };
  res.json({ question: publicQuestion(`p${insertPool(uid, tq, 1)}`, tq) });
}));

app.post('/api/diagnostic/done', auth, (req, res) => {
  setProfile(req.user.id, { diagnosticDone: today() });
  res.json({ ok: true });
});

// --- שיעורים קצרים ---------------------------------------------------------------------
app.get('/api/lessons/:topicId', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const { topicId } = req.params;
  if (!findSubtopic(topicId)) return res.status(404).json({ error: 'not_found' });
  const fresh = req.query.fresh === '1';
  const cached = one('SELECT content FROM lessons WHERE user_id = ? AND topic_id = ?', uid, topicId);
  if (cached && !fresh) return res.json({ lesson: JSON.parse(cached.content) });
  const lesson = await ai.generateLesson({ topicId, profile: getProfile(uid), notesContext: notesContextFor(uid, [topicId]), variant: fresh && !!cached });
  run('INSERT OR REPLACE INTO lessons (user_id, topic_id, content) VALUES (?, ?, ?)', uid, topicId, JSON.stringify(lesson));
  res.json({ lesson });
}));

app.post('/api/lessons/:topicId/done', auth, (req, res) => {
  L.addActivity(req.user.id, { xp: 15 });
  res.json({ ok: true });
});

// --- התקדמות וטעויות ---------------------------------------------------------------------
app.get('/api/progress', auth, (req, res) => {
  const uid = req.user.id;
  const stats = one(`SELECT COUNT(*) AS total, COALESCE(SUM(correct),0) AS correct FROM attempts WHERE user_id = ? AND created_at >= datetime('now','-7 day')`, uid);
  res.json({ units: L.unitProgress(uid), streak: L.streakInfo(uid), week: stats, profile: req.user.profile });
});

app.get('/api/mistakes', auth, (req, res) => {
  const uid = req.user.id;
  const open = all('SELECT * FROM mistakes WHERE user_id = ? AND resolved = 0 ORDER BY due_at', uid).map(L.parseMistake);
  const resolved = one('SELECT COUNT(*) AS n FROM mistakes WHERE user_id = ? AND resolved = 1', uid).n;
  res.json({ open, resolved, today: today() });
});

app.post('/api/mistakes/:id/resolve', auth, (req, res) => {
  run('UPDATE mistakes SET resolved = 1 WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});

// --- מחברת כיתה (צילומי שיעורים) ------------------------------------------------------------
app.get('/api/notes', auth, (req, res) => {
  res.json({ notes: all('SELECT id, title, topic_id, upload_ids, lesson_date, created_at FROM notes WHERE user_id = ? ORDER BY COALESCE(lesson_date, created_at) DESC', req.user.id).map((n) => ({ ...n, upload_ids: JSON.parse(n.upload_ids) })) });
});

app.post('/api/notes', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const { uploadIds = [], hint = '', lessonDate = today() } = req.body || {};
  const ids = uploadIds.filter((id) => one('SELECT id FROM uploads WHERE id = ? AND user_id = ?', id, uid)).slice(0, 8);
  if (!ids.length) return res.status(400).json({ error: 'no_images' });
  const a = await ai.analyzeNote({ uploadIds: ids, hint });
  const topicId = a.topic_id === 'other' ? null : a.topic_id;
  const id = run('INSERT INTO notes (user_id, topic_id, title, upload_ids, summary, notation, lesson_date) VALUES (?, ?, ?, ?, ?, ?, ?)', uid, topicId, a.title, JSON.stringify(ids), a.summary + (a.unclear ? `\n\n> 🔎 לא הצלחתי לקרוא: ${a.unclear}` : ''), a.notation, lessonDate).lastInsertRowid;
  L.addActivity(uid, { xp: 10 });
  res.json({ note: { ...one('SELECT * FROM notes WHERE id = ?', id), upload_ids: ids } });
}));

app.get('/api/notes/:id', auth, (req, res) => {
  const n = one('SELECT * FROM notes WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!n) return res.status(404).json({ error: 'not_found' });
  res.json({ note: { ...n, upload_ids: JSON.parse(n.upload_ids) } });
});

app.patch('/api/notes/:id', auth, (req, res) => {
  const { topicId, title } = req.body || {};
  if (topicId !== undefined) run('UPDATE notes SET topic_id = ? WHERE id = ? AND user_id = ?', topicId, req.params.id, req.user.id);
  if (title) run('UPDATE notes SET title = ? WHERE id = ? AND user_id = ?', title, req.params.id, req.user.id);
  res.json({ ok: true });
});

app.delete('/api/notes/:id', auth, (req, res) => {
  run('DELETE FROM notes WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.json({ ok: true });
});

// --- מבחנים -----------------------------------------------------------------------------
function examOwner(req) {
  return req.user.role === 'parent' ? studentId() : req.user.id;
}

app.get('/api/exams', auth, (req, res) => {
  const uid = examOwner(req);
  const exams = all('SELECT * FROM exams WHERE user_id = ? ORDER BY date DESC', uid).map(L.parseExam).map((e) => ({ ...e, daysLeft: daysBetween(today(), e.date) }));
  const mocks = all('SELECT id, exam_id, score, started_at, finished_at FROM mock_exams WHERE user_id = ? ORDER BY id DESC LIMIT 30', uid);
  res.json({ exams, mocks, today: today() });
});

app.post('/api/exams/extract', auth, wrap(async (req, res) => {
  const { uploadIds = [], text = '' } = req.body || {};
  res.json({ info: await ai.extractExamInfo({ uploadIds: uploadIds.slice(0, 4), text }) });
}));

app.post('/api/exams', auth, (req, res) => {
  const uid = examOwner(req);
  const { title, date, topicIds = [], notes = '' } = req.body || {};
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !topicIds.length) return res.status(400).json({ error: 'invalid' });
  const plan = L.buildExamPlan(date, topicIds, L.masteryMap(uid));
  const id = run('INSERT INTO exams (user_id, title, date, topic_ids, notes, plan) VALUES (?, ?, ?, ?, ?, ?)', uid, title, date, JSON.stringify(topicIds), notes, JSON.stringify(plan)).lastInsertRowid;
  run('DELETE FROM daily_plans WHERE user_id = ? AND day = ?', uid, today());
  res.json({ exam: L.parseExam(one('SELECT * FROM exams WHERE id = ?', id)) });
});

app.patch('/api/exams/:id', auth, (req, res) => {
  const uid = examOwner(req);
  const e = one('SELECT * FROM exams WHERE id = ? AND user_id = ?', req.params.id, uid);
  if (!e) return res.status(404).json({ error: 'not_found' });
  const { planDay, grade } = req.body || {};
  if (planDay) {
    const plan = JSON.parse(e.plan).map((p) => (p.day === planDay ? { ...p, done: !p.done } : p));
    run('UPDATE exams SET plan = ? WHERE id = ?', JSON.stringify(plan), e.id);
  }
  if (grade !== undefined) run('UPDATE exams SET grade = ? WHERE id = ?', grade === null || grade === '' ? null : Number(grade), e.id);
  res.json({ exam: L.parseExam(one('SELECT * FROM exams WHERE id = ?', e.id)) });
});

app.delete('/api/exams/:id', auth, (req, res) => {
  run('DELETE FROM exams WHERE id = ? AND user_id = ?', req.params.id, examOwner(req));
  run('DELETE FROM daily_plans WHERE user_id = ? AND day = ?', examOwner(req), today());
  res.json({ ok: true });
});

// --- מבחן דמה ----------------------------------------------------------------------------
function publicMock(m) {
  const questions = JSON.parse(m.questions);
  const finished = !!m.finished_at;
  return {
    id: m.id, exam_id: m.exam_id, minutes: m.minutes, started_at: m.started_at, finished_at: m.finished_at, score: m.score,
    topic_ids: JSON.parse(m.topic_ids),
    answers: JSON.parse(m.answers),
    results: m.results ? JSON.parse(m.results) : null,
    questions: questions.map((q) => ({ ...q, parts: q.parts.map((p) => (finished ? p : { label: p.label, prompt: p.prompt, points: p.points })) })),
  };
}

app.post('/api/mock', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const { examId = null, topicIds: tIds, minutes } = req.body || {};
  const exam = examId ? one('SELECT * FROM exams WHERE id = ? AND user_id = ?', examId, uid) : null;
  const topicIds = (exam ? JSON.parse(exam.topic_ids) : tIds || []).filter((id) => findSubtopic(id));
  if (!topicIds.length) return res.status(400).json({ error: 'no_topics' });
  const profile = getProfile(uid);
  const mins = Math.round((Number(minutes) || 45) * (profile.extraTime ? 1.25 : 1));
  const out = await ai.generateMockExam({ topicIds, minutes: mins, profile, notesContext: notesContextFor(uid, topicIds) });
  const id = run('INSERT INTO mock_exams (user_id, exam_id, topic_ids, minutes, questions) VALUES (?, ?, ?, ?, ?)', uid, exam?.id || null, JSON.stringify(topicIds), mins, JSON.stringify(out.questions)).lastInsertRowid;
  res.json({ mock: publicMock(one('SELECT * FROM mock_exams WHERE id = ?', id)) });
}));

app.get('/api/mock/:id', auth, (req, res) => {
  const m = one('SELECT * FROM mock_exams WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ mock: publicMock(m) });
});

app.post('/api/mock/:id/answers', auth, (req, res) => {
  const m = one('SELECT * FROM mock_exams WHERE id = ? AND user_id = ? AND finished_at IS NULL', req.params.id, req.user.id);
  if (!m) return res.status(404).json({ error: 'not_found' });
  run('UPDATE mock_exams SET answers = ? WHERE id = ?', JSON.stringify(req.body?.answers || {}), m.id);
  res.json({ ok: true });
});

app.post('/api/mock/:id/submit', auth, wrap(async (req, res) => {
  const uid = req.user.id;
  const m = one('SELECT * FROM mock_exams WHERE id = ? AND user_id = ? AND finished_at IS NULL', req.params.id, uid);
  if (!m) return res.status(404).json({ error: 'not_found' });
  const answers = req.body?.answers || JSON.parse(m.answers);
  const questions = JSON.parse(m.questions);
  const results = await Promise.all(questions.map(async (q, i) => {
    const a = answers[i] || {};
    const uploadIds = (a.uploadIds || []).filter((id) => one('SELECT id FROM uploads WHERE id = ? AND user_id = ?', id, uid));
    if (!a.text && !uploadIds.length) return { parts: q.parts.map((p) => ({ label: p.label, score: 0, max: p.points, feedback: 'לא נענה' })), summary: 'השאלה לא נענתה' };
    try {
      return await ai.gradeMockQuestion({ question: q, answerText: a.text, uploadIds });
    } catch (e) {
      console.error('grade error', e?.message);
      return { parts: q.parts.map((p) => ({ label: p.label, score: 0, max: p.points, feedback: 'לא הצלחתי לבדוק – שאלי את איגור בצ׳אט' })), summary: '' };
    }
  }));
  const total = results.reduce((s, r) => s + r.parts.reduce((a, p) => a + Math.min(p.score, p.max), 0), 0);
  const max = questions.reduce((s, q) => s + q.parts.reduce((a, p) => a + p.points, 0), 0) || 100;
  const score = Math.round((total / max) * 100);
  // סעיפים חלשים נכנסים למחברת הטעויות
  results.forEach((r, i) => r.parts.forEach((p, j) => {
    const part = questions[i].parts[j];
    if (part && p.score < p.max / 2) {
      L.addMistake(uid, questions[i].topic_id, { prompt: `${questions[i].intro}\n\n**סעיף ${part.label}:** ${part.prompt}`, answer_type: 'expression', choices: [], answer: part.answer, hints: [], solution: part.solution, difficulty: 3, skill: 'מבחן דמה' }, '');
    }
    L.updateMastery(uid, questions[i].topic_id, p.score >= p.max * 0.7, 0);
  }));
  run("UPDATE mock_exams SET answers = ?, results = ?, score = ?, finished_at = datetime('now') WHERE id = ?", JSON.stringify(answers), JSON.stringify(results), score, m.id);
  L.addActivity(uid, { xp: 50 });
  res.json({ mock: publicMock(one('SELECT * FROM mock_exams WHERE id = ?', m.id)) });
}));

// --- הורה ---------------------------------------------------------------------------------
function parentStats(sid) {
  const week = one(`SELECT COUNT(*) AS total, COALESCE(SUM(correct),0) AS correct FROM attempts WHERE user_id = ? AND created_at >= datetime('now','-7 day')`, sid);
  const prevWeek = one(`SELECT COUNT(*) AS total, COALESCE(SUM(correct),0) AS correct FROM attempts WHERE user_id = ? AND created_at >= datetime('now','-14 day') AND created_at < datetime('now','-7 day')`, sid);
  const byTopic = all(`SELECT topic_id, COUNT(*) AS n, SUM(correct) AS c FROM attempts WHERE user_id = ? AND created_at >= datetime('now','-7 day') GROUP BY topic_id ORDER BY n DESC`, sid).map((r) => ({ topic: findSubtopic(r.topic_id)?.title || r.topic_id, n: r.n, accuracy: Math.round((r.c / r.n) * 100) }));
  const chats = all(`SELECT title, mode FROM conversations WHERE user_id = ? AND updated_at >= datetime('now','-7 day') ORDER BY updated_at DESC LIMIT 15`, sid);
  const mocks = all(`SELECT score, finished_at FROM mock_exams WHERE user_id = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 5`, sid);
  return { week, prevWeek, byTopic, chats, mocks };
}

app.get('/api/parent/overview', auth, parentOnly, (req, res) => {
  const sid = studentId();
  if (!sid) return res.json({ student: null });
  const s = one('SELECT * FROM users WHERE id = ?', sid);
  res.json({
    student: { id: s.id, name: s.name, profile: JSON.parse(s.profile) },
    streak: L.streakInfo(sid),
    units: L.unitProgress(sid),
    exams: L.upcomingExams(sid).map((e) => ({ ...e, daysLeft: daysBetween(today(), e.date) })),
    openMistakes: one('SELECT COUNT(*) AS n FROM mistakes WHERE user_id = ? AND resolved = 0', sid).n,
    resolvedMistakes: one('SELECT COUNT(*) AS n FROM mistakes WHERE user_id = ? AND resolved = 1', sid).n,
    notesCount: one('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?', sid).n,
    ...parentStats(sid),
  });
});

app.post('/api/parent/summary', auth, parentOnly, wrap(async (req, res) => {
  const sid = studentId();
  const s = one('SELECT name FROM users WHERE id = ?', sid);
  const st = L.streakInfo(sid);
  const stats = { name: s.name, streak: st.streak, minutesThisWeek: st.week.reduce((a, d) => a + d.minutes, 0), activeDays: st.week.filter((d) => d.active).length, ...parentStats(sid), units: L.unitProgress(sid).map((u) => ({ unit: u.title, score: u.score, practiced: `${u.practiced}/${u.total}` })), upcomingExams: L.upcomingExams(sid).map((e) => `${e.title} ${e.date}`) };
  res.json({ summary: await ai.parentSummary({ stats }) });
}));

app.patch('/api/parent/student-settings', auth, parentOnly, (req, res) => {
  const sid = studentId();
  const allowed = ['dailyLimit', 'reminderTime', 'extraTime'];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  res.json({ profile: setProfile(sid, patch) });
});

app.post('/api/parent/reset-pin', auth, parentOnly, (req, res) => {
  const { newPin } = req.body || {};
  if (!/^\d{4,8}$/.test(newPin || '')) return res.status(400).json({ error: 'invalid' });
  run('UPDATE users SET pin_hash = ? WHERE id = ?', hashPin(newPin), studentId());
  res.json({ ok: true });
});

// --- התראות ---------------------------------------------------------------------------------
app.get('/api/push/key', (req, res) => res.json({ key: push.publicKey() }));
app.post('/api/push/subscribe', auth, (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint) return res.status(400).json({ error: 'bad' });
  run('INSERT OR REPLACE INTO push_subs (endpoint, user_id, sub) VALUES (?, ?, ?)', sub.endpoint, req.user.id, JSON.stringify(sub));
  res.json({ ok: true });
});
app.post('/api/push/test', auth, wrap(async (req, res) => {
  const sent = await push.sendTo(req.user.id, { title: 'איגור 🦉', body: 'ההתראות עובדות! נתראה מחר 💜', url: '/' });
  res.json({ sent });
}));

// --- סטטי ----------------------------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get(/.*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  const status = err instanceof ai.AnthropicError ? 502 : 500;
  if (!res.headersSent) res.status(status).json({ error: 'server_error', message: 'משהו השתבש. נסי שוב בעוד רגע.' });
});

push.startScheduler();
app.listen(PORT, () => console.log(`איגור רץ על http://localhost:${PORT} ${ai.MOCK ? '(מצב הדגמה – בלי מפתח API)' : `(מודל: ${ai.MODEL})`}`));
