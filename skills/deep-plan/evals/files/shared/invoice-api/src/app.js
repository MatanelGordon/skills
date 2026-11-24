// Composition root: every global middleware and every router is mounted here, in order.
import express from 'express';
import { rateLimit, requireAuth } from './middleware.js';
import { invoicesRouter } from './routes/invoices.js';

const ONE_MINUTE_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 300;

export function createApp({ db, jwtSecret }) {
  const app = express();
  app.use(express.json());
  // One limit for everybody, counted per client IP.
  app.use(rateLimit({ windowMs: ONE_MINUTE_MS, max: MAX_REQUESTS_PER_WINDOW }));
  app.use(requireAuth({ jwtSecret }));
  app.use('/invoices', invoicesRouter({ db }));
  app.use((err, _req, res, _next) => {
    res.status(err.status ?? 500).json({ error: err.message });
  });
  return app;
}
