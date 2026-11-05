import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.js';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + Number(process.env.SESSION_HOURS || 12) * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(userId, hashToken(token), expiresAt);
  return { token, expiresAt };
}

export function requireAuth(req, res, next) {
  const value = req.headers.authorization || '';
  const token = value.startsWith('Bearer ') ? value.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  const session = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.department
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
  `).get(hashToken(token), new Date().toISOString());
  if (!session) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  req.user = session;
  req.tokenHash = hashToken(token);
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

export function audit(actorId, action, targetType, targetId, details = {}) {
  db.prepare(`INSERT INTO audit_logs (actor_id, action, target_type, target_id, details_json)
              VALUES (?, ?, ?, ?, ?)`).run(actorId ?? null, action, targetType, String(targetId ?? ''), JSON.stringify(details));
}
