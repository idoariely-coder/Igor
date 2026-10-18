import webpush from 'web-push';
import { kvGet, kvSet, all, run, one, getProfile, today, nowInTZ } from './db.js';

let keys = kvGet('vapid');
if (!keys) {
  keys = webpush.generateVAPIDKeys();
  kvSet('vapid', keys);
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:igor@example.com', keys.publicKey, keys.privateKey);

export const publicKey = () => keys.publicKey;

export async function sendTo(userId, payload) {
  const subs = all('SELECT * FROM push_subs WHERE user_id = ?', userId);
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(JSON.parse(s.sub), JSON.stringify(payload));
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) run('DELETE FROM push_subs WHERE endpoint = ?', s.endpoint);
      else console.error('push error', err.statusCode, err.body);
    }
  }
  return sent;
}

const MESSAGES = [
  'היי! 10 דקות עם איגור היום? 🦉',
  'יש לך משימה קטנה ומחכה 💜 בואי נעשה אותה ביחד',
  'הרצף שלך מחכה לך 🔥 תרגיל אחד ואת בפנים',
  'יש שיעורי בית במתמטיקה? צלמי ונפתור ביחד 📸',
];

export function startScheduler() {
  setInterval(() => {
    const hhmm = nowInTZ();
    const day = today();
    for (const u of all("SELECT id FROM users WHERE role = 'student'")) {
      const p = getProfile(u.id);
      if (!p.reminderTime || p.reminderTime !== hhmm || p.lastReminder === day) continue;
      const act = one('SELECT xp FROM activity WHERE user_id = ? AND day = ?', u.id, day);
      if (act?.xp > 0) continue;
      run('UPDATE users SET profile = json_set(profile, \'$.lastReminder\', ?) WHERE id = ?', day, u.id);
      sendTo(u.id, { title: 'איגור', body: MESSAGES[Math.floor(Math.random() * MESSAGES.length)], url: '/' });
    }
  }, 30_000);
}
