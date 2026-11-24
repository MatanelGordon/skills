import { Router } from 'express';
import { findAll, findById, insert } from '../db/query.js';

export function invoicesRouter({ db }) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const filters = req.query.status ? { status: req.query.status } : {};
      res.json(await findAll(db, 'invoices', filters));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const invoice = await findById(db, 'invoices', req.params.id);
      if (!invoice) return res.status(404).json({ error: 'invoice not found' });
      return res.json(invoice);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { customer_id: customerId, amount_cents: amountCents } = req.body ?? {};
      if (!customerId || !Number.isInteger(amountCents)) {
        return res.status(400).json({ error: 'customer_id and amount_cents are required' });
      }
      const row = { customer_id: customerId, amount_cents: amountCents, status: 'draft', created_by: req.user.id };
      return res.status(201).json(await insert(db, 'invoices', row));
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
