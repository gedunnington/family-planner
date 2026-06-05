import { Router } from 'express';
import db from '../db.js';

const router = Router();

async function getEventsWithThemes(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = (await db.execute({
    sql: `SELECT * FROM events WHERE id IN (${placeholders}) ORDER BY next_date ASC NULLS LAST`,
    args: ids
  })).rows;
  return Promise.all(rows.map(async e => {
    const themes = (await db.execute({
      sql: `SELECT t.* FROM themes t JOIN event_themes et ON et.theme_id=t.id WHERE et.event_id=?`,
      args: [e.id]
    })).rows;
    return { ...e, themes };
  }));
}

async function getDismissedNames() {
  const rows = (await db.execute('SELECT event_name FROM dismissed_events')).rows;
  return new Set(rows.map(r => r.event_name));
}

router.get('/', async (req, res) => {
  const { mode, from, to, max_drive, theme_ids, lookahead_months = 3 } = req.query;
  const dismissed = await getDismissedNames();
  const maxDrive = max_drive ? parseInt(max_drive) : Infinity;

  let eventIds = [];

  if (mode === 'date') {
    const rows = (await db.execute({
      sql: `SELECT id FROM events WHERE
            (next_date IS NULL OR (next_date >= ? AND next_date <= ?))
            AND (drive_time_mins IS NULL OR drive_time_mins <= ?)`,
      args: [from, to, maxDrive === Infinity ? 99999 : maxDrive]
    })).rows;
    eventIds = rows.map(r => r.id);
  } else if (mode === 'theme') {
    const ids = theme_ids ? theme_ids.split(',').map(Number) : [];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() + parseInt(lookahead_months));
    const cutoffStr = cutoff.toISOString().split('T')[0];

    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = (await db.execute({
        sql: `SELECT DISTINCT e.id FROM events e
              JOIN event_themes et ON et.event_id = e.id
              WHERE et.theme_id IN (${placeholders})
              AND (e.next_date IS NULL OR e.next_date <= ?)`,
        args: [...ids, cutoffStr]
      })).rows;
      eventIds = rows.map(r => r.id);
    }
  }

  const events = await getEventsWithThemes(eventIds);
  const filtered = events.filter(e => !dismissed.has(e.name));
  res.json(filtered);
});

export default router;
