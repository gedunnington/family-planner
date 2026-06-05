import { Router } from 'express';
import db from '../db.js';
const router = Router();

router.get('/', async (_, res) => {
  const rows = (await db.execute('SELECT * FROM dismissed_events ORDER BY dismissed_at DESC')).rows;
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { event_name, source_url } = req.body;
  const result = await db.execute({
    sql: 'INSERT INTO dismissed_events (event_name, source_url) VALUES (?,?)',
    args: [event_name, source_url]
  });
  res.status(201).json({ id: Number(result.lastInsertRowid), event_name, source_url });
});

router.delete('/:id', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM dismissed_events WHERE id=?', args: [req.params.id] });
  res.status(204).end();
});

export default router;
