import { Router } from 'express';
import db from '../db.js';

const router = Router();

async function getEventWithThemes(id) {
  const event = (await db.execute({
    sql: 'SELECT * FROM events WHERE id = ?', args: [id]
  })).rows[0];
  if (!event) return null;
  const themes = (await db.execute({
    sql: `SELECT t.* FROM themes t
          JOIN event_themes et ON et.theme_id = t.id
          WHERE et.event_id = ?`, args: [id]
  })).rows;
  return { ...event, themes };
}

router.get('/', async (req, res) => {
  const rows = (await db.execute('SELECT * FROM events ORDER BY next_date ASC NULLS LAST')).rows;
  const events = await Promise.all(rows.map(e => getEventWithThemes(e.id)));
  res.json(events);
});

router.get('/:id', async (req, res) => {
  const event = await getEventWithThemes(req.params.id);
  if (!event) return res.status(404).json({ error: 'Not found' });
  res.json(event);
});

router.post('/', async (req, res) => {
  const { name, url, location, drive_time_mins, timing_notes,
          next_date, start_time, end_time, message, notes, theme_ids = [] } = req.body;
  const result = await db.execute({
    sql: `INSERT INTO events (name, url, location, drive_time_mins, timing_notes,
          next_date, start_time, end_time, message, notes)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [name, url, location ?? null, drive_time_mins ?? null, timing_notes ?? null,
           next_date ?? null, start_time ?? null, end_time ?? null, message ?? null, notes ?? null]
  });
  const id = Number(result.lastInsertRowid);
  for (const tid of theme_ids) {
    await db.execute({ sql: 'INSERT OR IGNORE INTO event_themes VALUES (?,?)', args: [id, tid] });
  }
  res.status(201).json(await getEventWithThemes(id));
});

router.put('/:id', async (req, res) => {
  const { name, url, location, drive_time_mins, timing_notes,
          next_date, start_time, end_time, last_fetched, fetch_error,
          message, notes, theme_ids = [] } = req.body;
  await db.execute({
    sql: `UPDATE events SET name=?, url=?, location=?, drive_time_mins=?,
          timing_notes=?, next_date=?, start_time=?, end_time=?,
          last_fetched=?, fetch_error=?, message=?, notes=? WHERE id=?`,
    args: [name, url, location ?? null, drive_time_mins ?? null, timing_notes ?? null,
           next_date ?? null, start_time ?? null, end_time ?? null,
           last_fetched ?? null, fetch_error ?? 0,
           message ?? null, notes ?? null, req.params.id]
  });
  await db.execute({ sql: 'DELETE FROM event_themes WHERE event_id=?', args: [req.params.id] });
  for (const tid of theme_ids) {
    await db.execute({ sql: 'INSERT OR IGNORE INTO event_themes VALUES (?,?)', args: [req.params.id, tid] });
  }
  res.json(await getEventWithThemes(req.params.id));
});

router.delete('/:id', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM events WHERE id=?', args: [req.params.id] });
  res.status(204).end();
});

export default router;
