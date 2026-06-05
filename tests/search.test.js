import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.LIBSQL_URL = 'file::memory:';
process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { initDb } = await import('../db.js');
const { default: db } = await import('../db.js');

beforeAll(async () => {
  await initDb();
  // Seed: one theme and two events
  await db.execute({
    sql: "INSERT INTO themes (name, description, source) VALUES ('Community','desc','Hunt Gather Parent')",
    args: []
  });
  await db.execute({
    sql: "INSERT INTO events (name, url, location, drive_time_mins, next_date) VALUES ('Near Event','https://a.com','Madison',10,'2026-06-07')",
    args: []
  });
  await db.execute({
    sql: "INSERT INTO events (name, url, location, drive_time_mins, next_date) VALUES ('Far Event','https://b.com','Chicago',200,'2026-06-07')",
    args: []
  });
  // Get theme id to link
  const themes = (await db.execute('SELECT id FROM themes ORDER BY id LIMIT 1')).rows;
  const events = (await db.execute("SELECT id FROM events WHERE name='Near Event'")).rows;
  await db.execute({
    sql: 'INSERT INTO event_themes VALUES (?,?)',
    args: [events[0].id, themes[0].id]
  });
});

describe('Search API', () => {
  it('by date returns events in range', async () => {
    const res = await request(app).get('/api/search?mode=date&from=2026-06-06&to=2026-06-08');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('by date with drive filter excludes far events', async () => {
    const res = await request(app).get('/api/search?mode=date&from=2026-06-06&to=2026-06-08&max_drive=60');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Near Event');
  });

  it('by theme returns matching events', async () => {
    const themes = (await db.execute('SELECT id FROM themes ORDER BY id LIMIT 1')).rows;
    const res = await request(app).get(`/api/search?mode=theme&theme_ids=${themes[0].id}&lookahead_months=3`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Near Event');
  });

  it('excludes dismissed events', async () => {
    await request(app).post('/api/dismissed').send({ event_name: 'Near Event', source_url: 'https://a.com' });
    const res = await request(app).get('/api/search?mode=date&from=2026-06-06&to=2026-06-08');
    expect(res.body.find(e => e.name === 'Near Event')).toBeUndefined();
  });
});
