import { Router } from 'express';
import db from '../db.js';
const router = Router();

router.get('/', async (_, res) => {
  const rows = (await db.execute('SELECT * FROM themes ORDER BY name')).rows;
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name, description, source } = req.body;
  const result = await db.execute({
    sql: 'INSERT INTO themes (name, description, source) VALUES (?,?,?)',
    args: [name, description, source]
  });
  res.status(201).json({ id: Number(result.lastInsertRowid), name, description, source });
});

router.put('/:id', async (req, res) => {
  const { name, description, source } = req.body;
  await db.execute({
    sql: 'UPDATE themes SET name=?, description=?, source=? WHERE id=?',
    args: [name, description, source, req.params.id]
  });
  res.json({ id: Number(req.params.id), name, description, source });
});

router.delete('/:id', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM themes WHERE id=?', args: [req.params.id] });
  res.status(204).end();
});

export default router;
