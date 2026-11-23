import jwt from 'jsonwebtoken';

const BEARER_PREFIX = 'Bearer ';
const MS_PER_SECOND = 1000;

// Verifies the bearer token and puts the caller on the request.
// Tokens already carry an `org_id` claim, but nothing reads it yet.
export function requireAuth({ jwtSecret }) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : null;
    if (!token) return res.status(401).json({ error: 'missing token' });
    try {
      const claims = jwt.verify(token, jwtSecret);
      req.user = { id: claims.sub, role: claims.role };
      return next();
    } catch {
      return res.status(401).json({ error: 'invalid token' });
    }
  };
}

// Fixed-window limiter. Counters live in this process, one per client IP.
export function rateLimit({ windowMs, max, now = Date.now }) {
  const windows = new Map();
  return (req, res, next) => {
    const key = req.ip;
    const time = now();
    const open = windows.get(key);
    const isSameWindow = open !== undefined && time - open.startedAt < windowMs;
    const current = isSameWindow
      ? { startedAt: open.startedAt, count: open.count + 1 }
      : { startedAt: time, count: 1 };
    windows.set(key, current);
    if (current.count > max) {
      const retryAfterSeconds = Math.ceil((current.startedAt + windowMs - time) / MS_PER_SECOND);
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: 'rate limit exceeded' });
    }
    return next();
  };
}
