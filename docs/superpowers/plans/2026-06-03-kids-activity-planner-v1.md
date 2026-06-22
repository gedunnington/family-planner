# Kids Activity Planner — V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hosted Node.js web app that lets a parent in Verona, WI query a curated list of kids events by date or theme, with AI-powered date extraction from event websites, editable moral messages, and a Facebook OAuth integration for events that live on Facebook.

**Architecture:** Single Express server serves both static frontend (plain HTML/CSS/JS) and a JSON API. SQLite via Turso (free hosted libSQL) provides persistence without data loss on Render redeploys. Claude Haiku handles all AI work: date extraction, theme suggestion, message drafting.

**Tech Stack:** Node.js 20+, Express 4, @libsql/client, @anthropic-ai/sdk, vitest, supertest, dotenv

---

## File Structure

```
kids-activity-planner/
├── package.json
├── server.js                  # Express app, route mounting, startup
├── db.js                      # libSQL client + schema init
├── routes/
│   ├── events.js              # CRUD: /api/events
│   ├── themes.js              # CRUD: /api/themes
│   ├── dismissed.js           # Dismiss/restore: /api/dismissed
│   ├── search.js              # Query by date/theme: /api/search
│   ├── ai.js                  # AI fetch+analyze: /api/ai
│   └── auth.js                # Facebook OAuth: /auth/facebook
├── services/
│   ├── fetcher.js             # URL fetch + HTML extraction
│   ├── ai.js                  # Claude API calls (date, themes, message)
│   └── facebook.js            # Facebook Graph API client
├── public/
│   ├── index.html             # SPA shell + all screen markup
│   ├── style.css              # All styles (mobile-first)
│   └── app.js                 # All frontend JS: navigation, API calls, rendering
├── tests/
│   ├── events.test.js
│   ├── themes.test.js
│   ├── dismissed.test.js
│   ├── search.test.js
│   └── ai.service.test.js
└── .env                       # ANTHROPIC_API_KEY, LIBSQL_URL, LIBSQL_AUTH_TOKEN,
                               # FB_APP_ID, FB_APP_SECRET, FB_REDIRECT_URI, BASE_URL
```

---

## Task 1: Project Setup & Database Schema

**Files:**
- Create: `package.json`
- Create: `server.js`
- Create: `db.js`
- Create: `.env`

- [ ] **Step 1: Initialize the project**

```bash
mkdir kids-activity-planner && cd kids-activity-planner
npm init -y
npm install express @libsql/client @anthropic-ai/sdk dotenv node-html-parser
npm install --save-dev vitest supertest
```

- [ ] **Step 2: Create Turso database**

Install the Turso CLI and create a free database:
```bash
# Install Turso CLI (Windows: use WSL or winget)
winget install turso
turso auth login
turso db create family-planner
turso db show family-planner   # copy the URL
turso db tokens create family-planner  # copy the auth token
```

Add to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
LIBSQL_URL=libsql://family-planner-<your-username>.turso.io
LIBSQL_AUTH_TOKEN=<token-from-above>
FB_APP_ID=
FB_APP_SECRET=
FB_REDIRECT_URI=http://localhost:3000/auth/facebook/callback
BASE_URL=http://localhost:3000
PORT=3000
```

For local dev only (skips Turso, uses local file):
```
LIBSQL_URL=file:./data.db
```

- [ ] **Step 3: Create `db.js`**

```javascript
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.LIBSQL_URL || 'file:./data.db',
  authToken: process.env.LIBSQL_AUTH_TOKEN,
});

export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      location TEXT,
      drive_time_mins INTEGER,
      timing_notes TEXT,
      next_date TEXT,
      start_time TEXT,
      end_time TEXT,
      last_fetched TEXT,
      fetch_error INTEGER DEFAULT 0,
      message TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      source TEXT
    );
    CREATE TABLE IF NOT EXISTS event_themes (
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      theme_id INTEGER REFERENCES themes(id) ON DELETE CASCADE,
      PRIMARY KEY (event_id, theme_id)
    );
    CREATE TABLE IF NOT EXISTS dismissed_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      dismissed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      provider TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      expires_at TEXT
    );
  `);
}

export default db;
```

- [ ] **Step 4: Create `server.js`**

```javascript
import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb } from './db.js';
import eventsRouter from './routes/events.js';
import themesRouter from './routes/themes.js';
import dismissedRouter from './routes/dismissed.js';
import searchRouter from './routes/search.js';
import aiRouter from './routes/ai.js';
import authRouter from './routes/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
app.use('/api/events', eventsRouter);
app.use('/api/themes', themesRouter);
app.use('/api/dismissed', dismissedRouter);
app.use('/api/search', searchRouter);
app.use('/api/ai', aiRouter);
app.use('/auth', authRouter);
app.get('*', (_, res) => res.sendFile(join(__dirname, 'public', 'index.html')));

export { app };

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  initDb().then(() => app.listen(PORT, () => console.log(`Running on port ${PORT}`)));
}
```

- [ ] **Step 5: Add scripts to `package.json`**

```json
{
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "vitest run"
  }
}
```

- [ ] **Step 6: Verify server starts**

```bash
node server.js
```
Expected: `Running on port 3000` — no errors.

- [ ] **Step 7: Commit**

```bash
git init
echo "node_modules/\n.env\ndata.db" > .gitignore
git add -A
git commit -m "feat: project scaffold with Express and libSQL schema"
```

---

## Task 2: Events CRUD API

**Files:**
- Create: `routes/events.js`
- Create: `tests/events.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/events.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import 'dotenv/config';
process.env.LIBSQL_URL = 'file::memory:';
const { app } = await import('../server.js');
const { initDb } = await import('../db.js');
beforeAll(() => initDb());

describe('Events API', () => {
  let eventId;

  it('POST /api/events creates an event', async () => {
    const res = await request(app).post('/api/events').send({
      name: 'Test Event', url: 'https://example.com', location: 'Madison, WI',
      drive_time_mins: 10, timing_notes: 'First Saturday', theme_ids: []
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    eventId = res.body.id;
  });

  it('GET /api/events returns list', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].themes).toBeDefined();
  });

  it('GET /api/events/:id returns single event', async () => {
    const res = await request(app).get(`/api/events/${eventId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test Event');
  });

  it('PUT /api/events/:id updates event', async () => {
    const res = await request(app).put(`/api/events/${eventId}`)
      .send({ name: 'Updated Event', url: 'https://example.com',
              location: 'Madison, WI', drive_time_mins: 15,
              timing_notes: 'First Saturday', theme_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Event');
  });

  it('DELETE /api/events/:id removes event', async () => {
    const res = await request(app).delete(`/api/events/${eventId}`);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run — confirm all fail**

```bash
npm test -- tests/events.test.js
```
Expected: 5 failing tests (routes not found).

- [ ] **Step 3: Create `routes/events.js`**

```javascript
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

// GET /api/events
router.get('/', async (req, res) => {
  const rows = (await db.execute('SELECT * FROM events ORDER BY next_date ASC NULLS LAST')).rows;
  const events = await Promise.all(rows.map(e => getEventWithThemes(e.id)));
  res.json(events);
});

// GET /api/events/:id
router.get('/:id', async (req, res) => {
  const event = await getEventWithThemes(req.params.id);
  if (!event) return res.status(404).json({ error: 'Not found' });
  res.json(event);
});

// POST /api/events
router.post('/', async (req, res) => {
  const { name, url, location, drive_time_mins, timing_notes,
          next_date, start_time, end_time, message, notes, theme_ids = [] } = req.body;
  const result = await db.execute({
    sql: `INSERT INTO events (name, url, location, drive_time_mins, timing_notes,
          next_date, start_time, end_time, message, notes)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [name, url, location, drive_time_mins, timing_notes,
           next_date, start_time, end_time, message, notes]
  });
  const id = Number(result.lastInsertRowid);
  for (const tid of theme_ids) {
    await db.execute({ sql: 'INSERT OR IGNORE INTO event_themes VALUES (?,?)', args: [id, tid] });
  }
  res.status(201).json(await getEventWithThemes(id));
});

// PUT /api/events/:id
router.put('/:id', async (req, res) => {
  const { name, url, location, drive_time_mins, timing_notes,
          next_date, start_time, end_time, last_fetched, fetch_error,
          message, notes, theme_ids = [] } = req.body;
  await db.execute({
    sql: `UPDATE events SET name=?, url=?, location=?, drive_time_mins=?,
          timing_notes=?, next_date=?, start_time=?, end_time=?,
          last_fetched=?, fetch_error=?, message=?, notes=? WHERE id=?`,
    args: [name, url, location, drive_time_mins, timing_notes,
           next_date, start_time, end_time, last_fetched, fetch_error ?? 0,
           message, notes, req.params.id]
  });
  await db.execute({ sql: 'DELETE FROM event_themes WHERE event_id=?', args: [req.params.id] });
  for (const tid of theme_ids) {
    await db.execute({ sql: 'INSERT OR IGNORE INTO event_themes VALUES (?,?)', args: [req.params.id, tid] });
  }
  res.json(await getEventWithThemes(req.params.id));
});

// DELETE /api/events/:id
router.delete('/:id', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM events WHERE id=?', args: [req.params.id] });
  res.status(204).end();
});

export default router;
```

- [ ] **Step 4: Run tests — confirm all pass**

```bash
npm test -- tests/events.test.js
```
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add routes/events.js tests/events.test.js
git commit -m "feat: events CRUD API with theme join"
```

---

## Task 3: Themes & Dismissed APIs

**Files:**
- Create: `routes/themes.js`
- Create: `routes/dismissed.js`
- Create: `tests/themes.test.js`
- Create: `tests/dismissed.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/themes.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
process.env.LIBSQL_URL = 'file::memory:';
const { app } = await import('../server.js');
const { initDb } = await import('../db.js');
beforeAll(() => initDb());

describe('Themes API', () => {
  let themeId;
  it('POST /api/themes creates a theme', async () => {
    const res = await request(app).post('/api/themes').send({
      name: 'Community', description: 'Kids contribute meaningfully', source: 'Hunt Gather Parent'
    });
    expect(res.status).toBe(201);
    themeId = res.body.id;
  });
  it('GET /api/themes returns list', async () => {
    const res = await request(app).get('/api/themes');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
  it('PUT /api/themes/:id updates a theme', async () => {
    const res = await request(app).put(`/api/themes/${themeId}`)
      .send({ name: 'Community Updated', description: 'Updated', source: 'Hunt Gather Parent' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Community Updated');
  });
  it('DELETE /api/themes/:id removes theme', async () => {
    const res = await request(app).delete(`/api/themes/${themeId}`);
    expect(res.status).toBe(204);
  });
});
```

```javascript
// tests/dismissed.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
process.env.LIBSQL_URL = 'file::memory:';
const { app } = await import('../server.js');
const { initDb } = await import('../db.js');
beforeAll(() => initDb());

describe('Dismissed API', () => {
  let dismissedId;
  it('POST /api/dismissed creates a dismissal', async () => {
    const res = await request(app).post('/api/dismissed').send({
      event_name: 'Boring Event', source_url: 'https://example.com'
    });
    expect(res.status).toBe(201);
    dismissedId = res.body.id;
  });
  it('GET /api/dismissed returns list', async () => {
    const res = await request(app).get('/api/dismissed');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
  it('DELETE /api/dismissed/:id restores event', async () => {
    const res = await request(app).delete(`/api/dismissed/${dismissedId}`);
    expect(res.status).toBe(204);
    const list = await request(app).get('/api/dismissed');
    expect(list.body.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run — confirm all fail**

```bash
npm test -- tests/themes.test.js tests/dismissed.test.js
```

- [ ] **Step 3: Create `routes/themes.js`**

```javascript
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
```

- [ ] **Step 4: Create `routes/dismissed.js`**

```javascript
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
```

- [ ] **Step 5: Run tests — all pass**

```bash
npm test -- tests/themes.test.js tests/dismissed.test.js
```

- [ ] **Step 6: Commit**

```bash
git add routes/themes.js routes/dismissed.js tests/themes.test.js tests/dismissed.test.js
git commit -m "feat: themes and dismissed events CRUD APIs"
```

---

## Task 4: URL Fetcher + Claude AI Service

**Files:**
- Create: `services/fetcher.js`
- Create: `services/ai.js`
- Create: `routes/ai.js`
- Create: `tests/ai.service.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/ai.service.test.js
import { describe, it, expect, vi } from 'vitest';

// Mock the Anthropic SDK before importing
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ text: JSON.stringify({
          date: '2027-02-27', start_time: '8:00 AM', end_time: null
        })}]
      })
    }
  }
}));

const { extractDateFromPage } = await import('../services/ai.js');

describe('AI service', () => {
  it('extractDateFromPage returns date object', async () => {
    const result = await extractDateFromPage(
      '<html>Race on February 27 2027 at 8am</html>',
      'Last weekend of February'
    );
    expect(result.date).toBe('2027-02-27');
    expect(result.start_time).toBe('8:00 AM');
    expect(result.end_time).toBeNull();
  });

  it('extractDateFromPage returns nulls on empty response', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    Anthropic.prototype.messages = {
      create: vi.fn().mockResolvedValue({ content: [{ text: 'unknown' }] })
    };
    const result = await extractDateFromPage('<html>No dates here</html>', '');
    expect(result.date).toBeNull();
  });
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
npm test -- tests/ai.service.test.js
```

- [ ] **Step 3: Create `services/fetcher.js`**

```javascript
import { parse } from 'node-html-parser';

export async function fetchPageText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FamilyPlanner/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  // Strip scripts/styles, return readable text (max 8000 chars to fit context window)
  const root = parse(html);
  root.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
  return root.text.replace(/\s+/g, ' ').trim().slice(0, 8000);
}
```

- [ ] **Step 4: Create `services/ai.js`**

```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function extractDateFromPage(pageText, timingNotes) {
  const prompt = `Given this webpage content and the note that this event typically occurs "${timingNotes}", what is the next upcoming date and time?

Webpage content:
${pageText}

Return ONLY valid JSON with this shape: {"date": "YYYY-MM-DD or null", "start_time": "H:MM AM/PM or null", "end_time": "H:MM AM/PM or null"}
If no upcoming date is found, use null for date.`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    return JSON.parse(msg.content[0].text);
  } catch {
    return { date: null, start_time: null, end_time: null };
  }
}

export async function suggestThemesAndMessage(eventName, pageText, allThemes) {
  const themeList = allThemes.map(t =>
    `ID ${t.id}: "${t.name}" (${t.source}) — ${t.description}`
  ).join('\n');

  const prompt = `You are helping a parent in Verona, WI plan intentional activities with their kids.

Event: ${eventName}
Page summary: ${pageText.slice(0, 2000)}

Available themes:
${themeList}

1. Which theme IDs apply to this event? Return only IDs that clearly fit.
2. Write a 2-4 sentence "message for today" — something the parent could say to their kids before or during this event, connecting it to the matched themes. Make it warm, specific, and grounded in the event's actual story or character.

Return ONLY valid JSON: {"theme_ids": [1, 2], "message": "..."}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  try {
    return JSON.parse(msg.content[0].text);
  } catch {
    return { theme_ids: [], message: '' };
  }
}
```

- [ ] **Step 5: Create `routes/ai.js`**

```javascript
import { Router } from 'express';
import { fetchPageText } from '../services/fetcher.js';
import { extractDateFromPage, suggestThemesAndMessage } from '../services/ai.js';
import db from '../db.js';

const router = Router();

// POST /api/ai/fetch  — step 1 of add event: fetch URL, extract date+time+name
router.post('/fetch', async (req, res) => {
  const { url, timing_notes = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  // Detect Facebook URL
  if (new URL(url).hostname.includes('facebook.com')) {
    const token = (await db.execute({
      sql: "SELECT access_token FROM auth_tokens WHERE provider='facebook'", args: []
    })).rows[0];
    if (!token) return res.status(401).json({ error: 'facebook_auth_required' });
    // Facebook events fetching handled via Graph API in facebook.js
    const { fetchFacebookEvents } = await import('../services/facebook.js');
    const events = await fetchFacebookEvents(token.access_token);
    return res.json({ facebook_events: events });
  }

  try {
    const pageText = await fetchPageText(url);
    const dateInfo = await extractDateFromPage(pageText, timing_notes);
    res.json({ pageText: pageText.slice(0, 500), ...dateInfo });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/ai/analyze  — step 2: suggest themes + draft message
router.post('/analyze', async (req, res) => {
  const { event_name, page_text } = req.body;
  const allThemes = (await db.execute('SELECT * FROM themes')).rows;
  if (!allThemes.length) return res.json({ theme_ids: [], message: '' });
  const result = await suggestThemesAndMessage(event_name, page_text || '', allThemes);
  res.json(result);
});

// POST /api/ai/refresh/:id  — refresh cached date for one event
router.post('/refresh/:id', async (req, res) => {
  const event = (await db.execute({
    sql: 'SELECT * FROM events WHERE id=?', args: [req.params.id]
  })).rows[0];
  if (!event) return res.status(404).json({ error: 'Not found' });

  try {
    const pageText = await fetchPageText(event.url);
    const dateInfo = await extractDateFromPage(pageText, event.timing_notes || '');
    await db.execute({
      sql: 'UPDATE events SET next_date=?, start_time=?, end_time=?, last_fetched=datetime("now"), fetch_error=0 WHERE id=?',
      args: [dateInfo.date, dateInfo.start_time, dateInfo.end_time, event.id]
    });
    res.json(dateInfo);
  } catch (err) {
    await db.execute({
      sql: 'UPDATE events SET fetch_error=1 WHERE id=?', args: [event.id]
    });
    res.status(502).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 6: Run tests — confirm pass**

```bash
npm test -- tests/ai.service.test.js
```

- [ ] **Step 7: Commit**

```bash
git add services/fetcher.js services/ai.js routes/ai.js tests/ai.service.test.js
git commit -m "feat: URL fetcher and Claude AI service for date extraction and theme suggestion"
```

---

## Task 5: Search API

**Files:**
- Create: `routes/search.js`
- Create: `tests/search.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// tests/search.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
process.env.LIBSQL_URL = 'file::memory:';
const { app } = await import('../server.js');
const { initDb } = await import('../db.js');
import db from '../db.js';

beforeAll(async () => {
  await initDb();
  // Seed: one theme, two events
  await db.execute({ sql: "INSERT INTO themes (id,name,description,source) VALUES (1,'Community','desc','Hunt Gather Parent')", args: [] });
  await db.execute({ sql: "INSERT INTO events (id,name,url,location,drive_time_mins,next_date) VALUES (1,'Near Event','https://a.com','Madison',10,'2026-06-07')", args: [] });
  await db.execute({ sql: "INSERT INTO events (id,name,url,location,drive_time_mins,next_date) VALUES (2,'Far Event','https://b.com','Chicago',200,'2026-06-07')", args: [] });
  await db.execute({ sql: "INSERT INTO event_themes VALUES (1,1)", args: [] });
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
    const res = await request(app).get('/api/search?mode=theme&theme_ids=1&lookahead_months=3');
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
```

- [ ] **Step 2: Run — confirm fail**

```bash
npm test -- tests/search.test.js
```

- [ ] **Step 3: Create `routes/search.js`**

```javascript
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

// GET /api/search?mode=date&from=YYYY-MM-DD&to=YYYY-MM-DD&max_drive=120
// GET /api/search?mode=theme&theme_ids=1,2&lookahead_months=3
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
```

- [ ] **Step 4: Run tests — all pass**

```bash
npm test -- tests/search.test.js
```

- [ ] **Step 5: Commit**

```bash
git add routes/search.js tests/search.test.js
git commit -m "feat: search API with date range, drive filter, theme filter, and dismissed exclusion"
```

---

## Task 6: Facebook OAuth

**Files:**
- Create: `services/facebook.js`
- Modify: `routes/auth.js`

**One-time setup (do this before running):**
1. Go to https://developers.facebook.com → Create App → select "Consumer"
2. Add "Facebook Login" product
3. Under Facebook Login → Settings, add `http://localhost:3000/auth/facebook/callback` to Valid OAuth Redirect URIs
4. Go to App Settings → Basic → copy App ID and App Secret into `.env`
5. Go to App Roles → Test Users (OR use your own account under App Roles → Roles)
6. The app stays in **Development mode** — no review needed since you're both the developer and the only user

- [ ] **Step 1: Create `services/facebook.js`**

```javascript
const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

export async function fetchFacebookEvents(accessToken) {
  const url = `${GRAPH_BASE}/me/events?fields=name,start_time,place,end_time&time_filter=upcoming&limit=50&access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Facebook API error: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(e => ({
    name: e.name,
    date: e.start_time ? e.start_time.split('T')[0] : null,
    start_time: e.start_time ? new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
    end_time: e.end_time ? new Date(e.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null,
    location: e.place?.name || null,
  }));
}

export function getFacebookAuthUrl(appId, redirectUri) {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'user_events',
    response_type: 'code',
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params}`;
}

export async function exchangeCodeForToken(code, appId, appSecret, redirectUri) {
  const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params}`);
  if (!res.ok) throw new Error('Token exchange failed');
  const data = await res.json();
  // Exchange short-lived token for long-lived (60 days)
  const llParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: data.access_token,
  });
  const llRes = await fetch(`${GRAPH_BASE}/oauth/access_token?${llParams}`);
  const llData = await llRes.json();
  return llData.access_token || data.access_token;
}
```

- [ ] **Step 2: Create `routes/auth.js`**

```javascript
import { Router } from 'express';
import { getFacebookAuthUrl, exchangeCodeForToken } from '../services/facebook.js';
import db from '../db.js';

const router = Router();

// GET /auth/facebook  — initiate OAuth
router.get('/facebook', (req, res) => {
  const url = getFacebookAuthUrl(
    process.env.FB_APP_ID,
    process.env.FB_REDIRECT_URI
  );
  res.redirect(url);
});

// GET /auth/facebook/callback
router.get('/facebook/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?fb_error=1');
  try {
    const token = await exchangeCodeForToken(
      code, process.env.FB_APP_ID, process.env.FB_APP_SECRET, process.env.FB_REDIRECT_URI
    );
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    await db.execute({
      sql: `INSERT INTO auth_tokens (provider, access_token, expires_at) VALUES ('facebook',?,?)
            ON CONFLICT(provider) DO UPDATE SET access_token=excluded.access_token, expires_at=excluded.expires_at`,
      args: [token, expiresAt]
    });
    res.redirect('/?fb_connected=1');
  } catch (err) {
    res.redirect('/?fb_error=1');
  }
});

// GET /auth/facebook/status
router.get('/facebook/status', async (_, res) => {
  const row = (await db.execute({
    sql: "SELECT expires_at FROM auth_tokens WHERE provider='facebook'", args: []
  })).rows[0];
  res.json({ connected: !!row, expires_at: row?.expires_at || null });
});

// DELETE /auth/facebook  — disconnect
router.delete('/facebook', async (_, res) => {
  await db.execute({ sql: "DELETE FROM auth_tokens WHERE provider='facebook'", args: [] });
  res.status(204).end();
});

export default router;
```

- [ ] **Step 3: Manual smoke test**

```bash
node server.js
# Open http://localhost:3000/auth/facebook in browser
# Should redirect to Facebook login
# After login, should redirect to /?fb_connected=1
# Verify: GET http://localhost:3000/auth/facebook/status → {"connected": true}
```

- [ ] **Step 4: Commit**

```bash
git add services/facebook.js routes/auth.js
git commit -m "feat: Facebook OAuth flow for fetching user events"
```

---

## Task 7: Frontend Shell + Navigation

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

- [ ] **Step 1: Create `public/style.css`**

Copy the full contents of `style.css` from `prototype.html` (the `<style>` block, without the `<style>` tags). It is already mobile-first and complete.

- [ ] **Step 2: Create `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Family Planner</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="app">
  <div class="header" id="hdr">
    <div class="header-left" id="hdr-left"></div>
    <div class="header-title" id="hdr-title">🧭 Family Planner</div>
    <div class="header-right" id="hdr-right"></div>
  </div>
  <div class="content">
    <div class="screen active" id="screen-home"></div>
    <div class="screen" id="screen-results"></div>
    <div class="screen" id="screen-detail"></div>
    <div class="screen" id="screen-events"></div>
    <div class="screen" id="screen-themes"></div>
    <div class="screen" id="screen-add"></div>
  </div>
  <div class="bottom-nav">
    <div class="nav-item active" id="nav-home" onclick="nav('home')">
      <span class="nav-icon">🔍</span><span>Search</span>
    </div>
    <div class="nav-item" id="nav-events" onclick="nav('events')">
      <span class="nav-icon">📋</span><span>Events</span>
    </div>
    <div class="nav-item" id="nav-themes" onclick="nav('themes')">
      <span class="nav-icon">💡</span><span>Themes</span>
    </div>
  </div>
</div>
<script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `public/app.js` — navigation core**

```javascript
// ── State ──────────────────────────────────────────────────────────────
const state = {
  themes: [],
  events: [],
  results: [],
  dismissed: [],
  sortMode: 'date',
  searchParams: {},
};

// ── API helpers ────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  return res.json();
}

const GET = path => api('GET', path);
const POST = (path, body) => api('POST', path, body);
const PUT = (path, body) => api('PUT', path, body);
const DELETE = path => api('DELETE', path);

// ── Navigation ─────────────────────────────────────────────────────────
function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + screenId).classList.add('active');
}

const TITLES = { home: '🧭 Family Planner', results: 'Results', detail: '',
                 events: 'My Events', themes: 'My Themes', add: 'Add Event' };

function setHeader(screen, backTarget) {
  document.getElementById('hdr-title').textContent = TITLES[screen] || '';
  document.getElementById('hdr-left').innerHTML = backTarget
    ? `<span style="color:#4a90d9;cursor:pointer" onclick="nav('${backTarget}')">← Back</span>` : '';
}

function nav(screen) {
  show(screen);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-' + screen)?.classList.add('active');
  setHeader(screen, null);
  if (screen === 'home') renderHome();
  if (screen === 'events') renderEventsList();
  if (screen === 'themes') renderThemesList();
}

// ── Init ───────────────────────────────────────────────────────────────
async function init() {
  [state.themes, state.dismissed] = await Promise.all([
    GET('/api/themes'), GET('/api/dismissed')
  ]);
  // Check for OAuth return params
  const params = new URLSearchParams(location.search);
  if (params.get('fb_connected')) { history.replaceState({}, '', '/'); alert('Facebook connected!'); }
  if (params.get('fb_error')) { history.replaceState({}, '', '/'); alert('Facebook connection failed — check your app settings.'); }
  renderHome();
}

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 4: Verify shell loads**

```bash
node server.js
# Open http://localhost:3000
# Expected: app shell with bottom nav, no JS errors in console
```

- [ ] **Step 5: Commit**

```bash
git add public/
git commit -m "feat: frontend shell with navigation and API helpers"
```

---

## Task 8: Home Screen + Results

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add `renderHome()` to `app.js`**

```javascript
function renderHome() {
  document.getElementById('screen-home').innerHTML = `
    <div class="tabs">
      <div class="tab active" id="tab-date" onclick="homeTab('date')">By Date</div>
      <div class="tab" id="tab-theme" onclick="homeTab('theme')">By Theme</div>
    </div>
    <div id="pane-date">
      <div class="section">
        <div class="label">When do you have free time?</div>
        <div class="preset-grid">
          <div class="preset-btn selected" id="pr-weekend" onclick="setPr('weekend',this)">
            <div class="p-label">This weekend</div>
            <div class="p-sub" id="weekend-sub"></div>
          </div>
          <div class="preset-btn" id="pr-2wk" onclick="setPr('2wk',this)">
            <div class="p-label">Next 2 weeks</div>
            <div class="p-sub" id="2wk-sub"></div>
          </div>
          <div class="preset-btn" id="pr-month" onclick="setPr('month',this)">
            <div class="p-label">This month</div>
            <div class="p-sub" id="month-sub"></div>
          </div>
          <div class="preset-btn" id="pr-custom" onclick="setPr('custom',this)">
            <div class="p-label">Custom</div><div class="p-sub">Pick dates</div>
          </div>
        </div>
        <div id="custom-dates" style="display:none" class="form-2col" style="margin-bottom:16px">
          <div><label class="form-label">From</label><input type="date" class="form-input" id="cust-from"></div>
          <div><label class="form-label">To</label><input type="date" class="form-input" id="cust-to"></div>
        </div>
        <div class="label">Max drive time</div>
        <div class="chips">
          <div class="chip selected" id="dr-any" onclick="setDrive('any',this)">Any</div>
          <div class="chip" id="dr-30" onclick="setDrive('30',this)">30 min</div>
          <div class="chip" id="dr-60" onclick="setDrive('60',this)">1 hour</div>
          <div class="chip" id="dr-120" onclick="setDrive('120',this)">2 hours</div>
        </div>
        <button class="btn btn-blue" onclick="runSearch('date')">Find events</button>
      </div>
    </div>
    <div id="pane-theme" style="display:none">
      <div class="section">
        <div class="label">What do you want to focus on?</div>
        <div class="chips">${state.themes.map(t =>
          `<div class="chip" data-tid="${t.id}" onclick="toggleTheme(${t.id},this)">${t.name}</div>`
        ).join('')}</div>
        <div class="label">Within the next</div>
        <div class="chips">
          <div class="chip selected" id="lk-3" onclick="setLookahead(3,this)">3 months</div>
          <div class="chip" id="lk-6" onclick="setLookahead(6,this)">6 months</div>
          <div class="chip" id="lk-12" onclick="setLookahead(12,this)">1 year</div>
        </div>
        <button class="btn btn-blue" onclick="runSearch('theme')">Find events</button>
      </div>
    </div>`;

  // Set preset sublabels with real dates
  const now = new Date();
  const weekend = nextWeekend(now);
  document.getElementById('weekend-sub').textContent =
    `${fmtShort(weekend.from)}–${fmtShort(weekend.to)}`;
  document.getElementById('2wk-sub').textContent =
    `${fmtShort(now)}–${fmtShort(addDays(now, 14))}`;
  document.getElementById('month-sub').textContent =
    now.toLocaleString('default', { month: 'long' });
}

// Home state
let selectedPreset = 'weekend', selectedDrive = 'any';
let selectedThemes = [], selectedLookahead = 3;

function homeTab(t) {
  document.getElementById('pane-date').style.display = t === 'date' ? 'block' : 'none';
  document.getElementById('pane-theme').style.display = t === 'theme' ? 'block' : 'none';
  document.getElementById('tab-date').classList.toggle('active', t === 'date');
  document.getElementById('tab-theme').classList.toggle('active', t === 'theme');
}

function setPr(p, el) {
  selectedPreset = p;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('custom-dates').style.display = p === 'custom' ? 'grid' : 'none';
}

function setDrive(v, el) {
  selectedDrive = v;
  document.querySelectorAll('#pane-date .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function toggleTheme(id, el) {
  selectedThemes = selectedThemes.includes(id)
    ? selectedThemes.filter(t => t !== id) : [...selectedThemes, id];
  el.classList.toggle('selected');
}

function setLookahead(v, el) {
  selectedLookahead = v;
  document.querySelectorAll('#pane-theme .chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

async function runSearch(mode) {
  let url;
  if (mode === 'date') {
    const { from, to } = getDateRange();
    const drive = selectedDrive === 'any' ? '' : `&max_drive=${selectedDrive}`;
    url = `/api/search?mode=date&from=${isoDate(from)}&to=${isoDate(to)}${drive}`;
  } else {
    const ids = selectedThemes.join(',') || state.themes.map(t => t.id).join(',');
    url = `/api/search?mode=theme&theme_ids=${ids}&lookahead_months=${selectedLookahead}`;
  }
  state.results = await GET(url);
  state.sortMode = 'date';
  renderResults();
  show('results');
  setHeader('results', 'home');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}
```

- [ ] **Step 2: Add `renderResults()` and card rendering to `app.js`**

```javascript
// Theme tag CSS classes by theme name (falls back to a default)
const TAG_COLORS = {
  'Community': 'tc', 'Community Contribution': 'tc',
  'Physical': 'tp', 'Physical Challenge': 'tp',
  'Nature': 'tn', 'Nature Connection': 'tn',
  'Simplicity': 'ts',
  'Wonder': 'tw', 'Wonder & Curiosity': 'tw',
  'SEL': 'tsel', 'Social-Emotional Learning': 'tsel',
  'Autonomy': 'ta', 'Autonomy & Risk-taking': 'ta',
};

function tagClass(name) { return TAG_COLORS[name] || 'tw'; }

function fmtDrive(mins) {
  if (!mins) return '';
  if (mins >= 60) { const h = Math.floor(mins/60), m = mins%60; return m ? `${h}h ${m}m` : `${h}h`; }
  return `${mins} min`;
}

function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US',
    { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

function cardHtml(e) {
  const tags = (e.themes || []).map(t =>
    `<span class="tag ${tagClass(t.name)}">${t.name}</span>`).join('');
  const timeStr = e.start_time
    ? (e.end_time ? ` · ${e.start_time}–${e.end_time}` : ` · from ${e.start_time}`) : '';
  const dateStr = e.next_date ? fmtDate(e.next_date) + timeStr + ' · ' : '';
  const driveStr = fmtDrive(e.drive_time_mins);
  const undated = !e.next_date
    ? `<div class="card-undated">⚠ Date not yet announced · ${e.timing_notes || ''}${e.start_time ? ' · starts ' + e.start_time : ''}</div>` : '';
  const staleNote = e.fetch_error
    ? `<div class="card-undated">⚠ Last known date — may be outdated</div>` : '';
  return `<div class="event-card ${!e.next_date ? 'undated' : ''}" onclick="showDetail(${e.id})">
    <div class="card-row1">
      <div class="card-name">${e.name}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <div class="card-drive">${driveStr}</div>
        <div class="card-overflow" onclick="event.stopPropagation();toggleOverflow(${e.id})">···</div>
      </div>
    </div>
    <div class="card-meta">${dateStr}${e.location || ''}</div>
    ${undated}${staleNote}
    <div class="tag-row">${tags}</div>
    <div class="overflow-menu" id="overflow-${e.id}" style="display:none">
      <div class="overflow-item" onclick="event.stopPropagation();showDetail(${e.id})">View details</div>
      <div class="overflow-item dismiss" onclick="event.stopPropagation();dismissEvent(${e.id},'${e.name.replace(/'/g,"\\'")}','${(e.url||'').replace(/'/g,"\\'")}')">Not for us — hide forever</div>
    </div>
  </div>`;
}

function toggleOverflow(id) {
  document.querySelectorAll('.overflow-menu').forEach(m => {
    if (m.id !== `overflow-${id}`) m.style.display = 'none';
  });
  const m = document.getElementById(`overflow-${id}`);
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

async function dismissEvent(id, name, url) {
  if (!confirm(`Hide "${name}" forever?\n\nYou can restore it from the Events list.`)) return;
  await POST('/api/dismissed', { event_name: name, source_url: url });
  state.dismissed = await GET('/api/dismissed');
  state.results = state.results.filter(e => e.id !== id);
  renderResults();
}

function sortResults(by, el) {
  state.sortMode = by;
  document.querySelectorAll('.sort-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderResults();
}

function renderResults() {
  let sorted = [...state.results];
  if (state.sortMode === 'date') {
    sorted.sort((a, b) => !a.next_date ? 1 : !b.next_date ? -1
      : a.next_date.localeCompare(b.next_date));
  } else if (state.sortMode === 'drive') {
    sorted.sort((a, b) => (a.drive_time_mins || 9999) - (b.drive_time_mins || 9999));
  } else {
    sorted.sort((a, b) => (b.themes?.length || 0) - (a.themes?.length || 0));
  }

  const el = document.getElementById('screen-results');
  if (!sorted.length) {
    el.innerHTML = `<div class="results-bar">No events match</div>
      <div class="empty"><div class="empty-icon">🗓</div>
      <div class="empty-text">No events match this window.<br>Try a wider date range or distance.</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="results-bar">${sorted.length} event${sorted.length !== 1 ? 's' : ''} found</div>
    <div class="sort-row">
      <div class="sort-chip ${state.sortMode==='date'?'active':''}" onclick="sortResults('date',this)">Date</div>
      <div class="sort-chip ${state.sortMode==='drive'?'active':''}" onclick="sortResults('drive',this)">Drive time</div>
      <div class="sort-chip ${state.sortMode==='theme'?'active':''}" onclick="sortResults('theme',this)">Theme coverage</div>
    </div>
    ${sorted.map(cardHtml).join('')}`;
}
```

- [ ] **Step 3: Manual test**

```bash
node server.js
# Open http://localhost:3000
# Add a theme via: POST http://localhost:3000/api/themes {"name":"Community","description":"...","source":"Hunt Gather Parent"}
# Add an event via: POST http://localhost:3000/api/events {"name":"Test","url":"https://example.com","next_date":"2026-06-10","location":"Madison","drive_time_mins":10,"theme_ids":[1]}
# In the app: tap "Find events" → should show the seeded event
# Tap ··· → overflow menu appears; tap "Not for us" → event disappears
```

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: home search screen and results with sorting and dismiss"
```

---

## Task 9: Event Detail + Add/Edit Flow

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add `showDetail()` to `app.js`**

```javascript
async function showDetail(id) {
  const e = await GET(`/api/events/${id}`);
  const timeStr = e.start_time
    ? (e.end_time ? ` · ${e.start_time}–${e.end_time}` : ` · from ${e.start_time}`) : '';
  const dateStr = e.next_date ? fmtDate(e.next_date) + timeStr : 'Date not yet announced';
  const driveStr = e.drive_time_mins ? ` · ${fmtDrive(e.drive_time_mins)}` : '';
  const tags = (e.themes || []).map(t =>
    `<span class="tag ${tagClass(t.name)}" style="font-size:12px;padding:4px 10px">${t.name}</span>`).join('');

  document.getElementById('screen-detail').innerHTML = `
    <div class="detail-wrap">
      <div class="detail-name">${e.name}</div>
      <div class="detail-meta">${dateStr} · ${e.location || ''}${driveStr}</div>
      <div class="detail-tags">${tags}</div>
      <div class="msg-block">
        <div class="msg-label">Message for today</div>
        <div class="msg-text" id="msg-text-${e.id}" contenteditable="true"
             onblur="saveMessage(${e.id},this.textContent)">${e.message || ''}</div>
        <div class="msg-source">Tap to edit</div>
      </div>
      ${e.notes ? `<div class="detail-sec">
        <div class="detail-sec-label">Your notes</div>
        <div class="detail-sec-text">${e.notes}</div>
      </div>` : ''}
      <a href="${e.url}" target="_blank" class="link-out">View event website ↗</a><br>
      <button class="outline-btn" onclick="showAdd(${e.id})">Edit event</button>
      <br><br>
      <button onclick="refreshEventDate(${e.id})"
        style="background:none;border:none;color:#4a90d9;font-size:13px;cursor:pointer">
        ↻ Refresh date from website
      </button>
    </div>`;

  show('detail');
  setHeader('detail', 'results');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

async function saveMessage(id, text) {
  const e = await GET(`/api/events/${id}`);
  await PUT(`/api/events/${id}`, { ...e, message: text, theme_ids: (e.themes||[]).map(t=>t.id) });
}

async function refreshEventDate(id) {
  const btn = event.target;
  btn.textContent = '↻ Refreshing...';
  btn.disabled = true;
  try {
    const result = await POST(`/api/ai/refresh/${id}`);
    if (result.date) {
      btn.textContent = `✓ Updated: ${fmtDate(result.date)}`;
    } else {
      btn.textContent = '⚠ No date found on page';
    }
  } catch {
    btn.textContent = '✗ Refresh failed';
  }
  setTimeout(() => { btn.textContent = '↻ Refresh date from website'; btn.disabled = false; }, 3000);
}
```

- [ ] **Step 2: Add `showAdd()` and the two-step form to `app.js`**

```javascript
let addPageText = '';  // stored between step 1 and step 2

async function showAdd(editId = null) {
  addPageText = '';
  const editing = editId ? await GET(`/api/events/${editId}`) : null;

  document.getElementById('screen-add').innerHTML = `
    <div class="step-bar" id="add-step-bar">Step 1 of 2 — Basics</div>
    <div id="add-s1" class="section">
      <div class="form-group">
        <label class="form-label">Event website URL</label>
        <div class="fetch-row">
          <input class="form-input" id="add-url" type="url" placeholder="https://..."
                 value="${editing?.url || ''}">
          <button class="fetch-btn" id="fetch-btn" onclick="doFetch()">Fetch ↗</button>
        </div>
        <div class="fetch-ok" id="fetch-ok" style="display:none"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Event name</label>
        <input class="form-input" id="add-name" placeholder="e.g. Birkie Ski Race"
               value="${editing?.name || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Location</label>
        <input class="form-input" id="add-loc" placeholder="City, venue, or address"
               value="${editing?.location || ''}">
      </div>
      <div class="form-2col" style="margin-bottom:16px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Drive time (min)</label>
          <input class="form-input" id="add-drive" type="number" placeholder="45"
                 value="${editing?.drive_time_mins || ''}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Timing notes</label>
          <input class="form-input" id="add-timing" placeholder="e.g. First wknd Feb"
                 value="${editing?.timing_notes || ''}">
        </div>
      </div>
      <div class="form-2col" style="margin-bottom:16px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Start time <span style="color:#aaa;font-weight:normal;font-size:10px">AI fills</span></label>
          <input class="form-input" id="add-start" type="time"
                 value="${editing?.start_time ? toTimeInput(editing.start_time) : ''}">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">End time <span style="color:#aaa;font-weight:normal;font-size:10px">optional</span></label>
          <input class="form-input" id="add-end" type="time"
                 value="${editing?.end_time ? toTimeInput(editing.end_time) : ''}">
        </div>
      </div>
      <button class="btn btn-blue" onclick="addStep2(${editId || 'null'})">Next →</button>
    </div>
    <div id="add-s2" class="section" style="display:none">
      <div class="form-group">
        <label class="form-label">Themes <span style="color:#9b59b6;font-size:10px">✦ AI suggested</span></label>
        <div class="chips" id="add-theme-chips"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Message for your kids <span style="color:#9b59b6;font-size:10px">✦ AI draft</span></label>
        <textarea class="form-input" id="add-msg" rows="5">${editing?.message || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Your notes</label>
        <textarea class="form-input" id="add-notes" rows="2"
                  placeholder="Reminders, logistics...">${editing?.notes || ''}</textarea>
      </div>
      <button class="btn btn-green" onclick="saveEvent(${editId || 'null'})">Save event</button>
    </div>`;

  document.getElementById('screen-add').dataset.editId = editId || '';
  show('add');
  setHeader('add', editId ? 'detail' : 'events');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

async function doFetch() {
  const url = document.getElementById('add-url').value.trim();
  if (!url) return alert('Enter a URL first');
  const btn = document.getElementById('fetch-btn');
  btn.textContent = 'Fetching...'; btn.disabled = true;

  // Check for Facebook URL
  try { if (new URL(url).hostname.includes('facebook.com')) {
    const status = await GET('/auth/facebook/status');
    if (!status.connected) {
      btn.textContent = 'Fetch ↗'; btn.disabled = false;
      if (confirm('Facebook login required. Connect now?')) location.href = '/auth/facebook';
      return;
    }
  }} catch {}

  try {
    const timing = document.getElementById('add-timing').value;
    const result = await POST('/api/ai/fetch', { url, timing_notes: timing });

    if (result.facebook_events) {
      // Show Facebook events list for user to pick from
      const names = result.facebook_events.map((e, i) =>
        `${i+1}. ${e.name} — ${e.date || 'no date'}`).join('\n');
      const choice = prompt(`Facebook events found:\n${names}\n\nEnter number to import (or Cancel):`);
      if (choice) {
        const ev = result.facebook_events[parseInt(choice)-1];
        if (ev) {
          document.getElementById('add-name').value = ev.name;
          document.getElementById('add-loc').value = ev.location || '';
          document.getElementById('add-start').value = ev.start_time ? toTimeInput(ev.start_time) : '';
          document.getElementById('add-end').value = ev.end_time ? toTimeInput(ev.end_time) : '';
          addPageText = ev.name;
        }
      }
    } else {
      if (result.date) document.getElementById('add-name').value =
        document.getElementById('add-name').value || '';
      document.getElementById('add-start').value = result.start_time ? toTimeInput(result.start_time) : '';
      document.getElementById('add-end').value = result.end_time ? toTimeInput(result.end_time) : '';
      addPageText = result.pageText || '';
      const ok = document.getElementById('fetch-ok');
      ok.style.display = 'block';
      ok.textContent = result.date ? `✓ Detected date: ${fmtDate(result.date)}` : '✓ Page fetched — no date detected yet';
    }
  } catch (err) {
    alert('Fetch failed: ' + err.message);
  }
  btn.textContent = 'Fetch ↗'; btn.disabled = false;
}

let addThemeSelections = [];

async function addStep2(editId) {
  const name = document.getElementById('add-name').value.trim();
  if (!name) return alert('Please enter an event name');

  document.getElementById('add-s1').style.display = 'none';
  document.getElementById('add-s2').style.display = 'block';
  document.getElementById('add-step-bar').textContent = 'Step 2 of 2 — Themes & Message';

  // AI suggest themes + message (skip if editing and we have no new page text)
  let suggested = { theme_ids: [], message: '' };
  if (addPageText) {
    suggested = await POST('/api/ai/analyze', { event_name: name, page_text: addPageText });
  } else if (editId) {
    const existing = await GET(`/api/events/${editId}`);
    suggested.theme_ids = (existing.themes || []).map(t => t.id);
    suggested.message = existing.message || '';
  }

  addThemeSelections = suggested.theme_ids || [];
  document.getElementById('add-theme-chips').innerHTML = state.themes.map(t =>
    `<div class="chip ${addThemeSelections.includes(t.id)?'selected':''}"
          onclick="toggleAddTheme(${t.id},this)">${t.name}</div>`
  ).join('');
  if (suggested.message && !document.getElementById('add-msg').value) {
    document.getElementById('add-msg').value = suggested.message;
  }
}

function toggleAddTheme(id, el) {
  addThemeSelections = addThemeSelections.includes(id)
    ? addThemeSelections.filter(t => t !== id) : [...addThemeSelections, id];
  el.classList.toggle('selected');
}

async function saveEvent(editId) {
  const body = {
    name: document.getElementById('add-name').value.trim(),
    url: document.getElementById('add-url').value.trim(),
    location: document.getElementById('add-loc').value.trim(),
    drive_time_mins: parseInt(document.getElementById('add-drive').value) || null,
    timing_notes: document.getElementById('add-timing').value.trim(),
    start_time: fromTimeInput(document.getElementById('add-start').value),
    end_time: fromTimeInput(document.getElementById('add-end').value),
    message: document.getElementById('add-msg').value.trim(),
    notes: document.getElementById('add-notes').value.trim(),
    theme_ids: addThemeSelections,
  };
  if (!body.name || !body.url) return alert('Name and URL are required');

  if (editId) {
    await PUT(`/api/events/${editId}`, body);
  } else {
    await POST('/api/events', body);
  }
  state.themes = await GET('/api/themes');
  nav('events');
}

// Convert "14:30" → "2:30 PM" and back
function fromTimeInput(val) {
  if (!val) return null;
  const [h, m] = val.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2,'0')} ${period}`;
}
function toTimeInput(val) {
  if (!val) return '';
  const [time, period] = val.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}
```

- [ ] **Step 3: Manual test**

```bash
# In the app:
# 1. Tap Events → "Add event"
# 2. Paste https://www.birkie.com/calendar/ → tap "Fetch ↗"
# Expected: date detected, pre-filled
# 3. Tap "Next" → themes suggested, message drafted
# 4. Edit message → tap "Save event"
# 5. Find event in list → tap it → verify detail screen shows message
# 6. Edit message inline (tap it) → navigate away and back → message persists
```

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat: event detail with inline message editing and add/edit two-step flow"
```

---

## Task 10: Events List + Themes Screen

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add `renderEventsList()` to `app.js`**

```javascript
async function renderEventsList() {
  state.events = await GET('/api/events');
  state.dismissed = await GET('/api/dismissed');
  const sorted = [...state.events].sort((a, b) =>
    !a.next_date ? 1 : !b.next_date ? -1 : a.next_date.localeCompare(b.next_date));
  const dismissedIds = new Set(state.dismissed.map(d => d.event_name));
  const visible = sorted.filter(e => !dismissedIds.has(e.name));
  const hiddenCount = sorted.length - visible.length;

  document.getElementById('screen-events').innerHTML = `
    <div class="list-hdr">
      <span class="list-count" id="events-count">
        ${visible.length} events${hiddenCount ? ` · <a href="#" onclick="showDismissed();return false"
          style="color:#4a90d9">${hiddenCount} hidden</a>` : ''}
      </span>
      <button class="add-btn" onclick="showAdd()">+ Add event</button>
    </div>
    ${visible.map(e => cardHtml(e)).join('')}`;
}

async function showDismissed() {
  const list = state.dismissed.map(d => `• ${d.event_name}`).join('\n');
  if (confirm(`Hidden events:\n${list}\n\nRestore all?`)) {
    await Promise.all(state.dismissed.map(d => DELETE(`/api/dismissed/${d.id}`)));
    state.dismissed = [];
    renderEventsList();
  }
}
```

- [ ] **Step 2: Add `renderThemesList()` to `app.js`**

```javascript
async function renderThemesList() {
  state.themes = await GET('/api/themes');
  document.getElementById('screen-themes').innerHTML = `
    <div class="list-hdr">
      <span class="list-count">Your values framework</span>
      <button class="add-btn" onclick="showAddTheme()">+ Add</button>
    </div>
    ${state.themes.map(t => `
      <div class="theme-item" onclick="showEditTheme(${t.id})">
        <div class="theme-name">${t.name}</div>
        <div class="theme-source">${t.source || ''}</div>
        <div class="theme-desc">${t.description || ''}</div>
      </div>`).join('')}`;
}

function themeFormHtml(t = {}) {
  return `
    <div class="section">
      <div class="form-group">
        <label class="form-label">Theme name</label>
        <input class="form-input" id="th-name" value="${t.name || ''}" placeholder="e.g. Community Contribution">
      </div>
      <div class="form-group">
        <label class="form-label">Description <span style="color:#aaa;font-size:10px">AI uses this to tag events</span></label>
        <textarea class="form-input" id="th-desc" rows="4" placeholder="What this theme means and why it matters...">${t.description || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Source</label>
        <input class="form-input" id="th-src" value="${t.source || ''}" placeholder="e.g. Hunt Gather Parent">
      </div>
      <button class="btn btn-blue" onclick="saveTheme(${t.id || 'null'})">Save theme</button>
      ${t.id ? `<br><br><button onclick="deleteTheme(${t.id})" style="color:#c0392b;background:none;border:none;cursor:pointer;font-size:14px">Delete theme</button>` : ''}
    </div>`;
}

function showAddTheme() {
  document.getElementById('screen-themes').innerHTML = themeFormHtml();
  setHeader('themes', 'themes');
  document.getElementById('hdr-left').innerHTML =
    `<span style="color:#4a90d9;cursor:pointer" onclick="nav('themes')">← Back</span>`;
}

async function showEditTheme(id) {
  const t = state.themes.find(x => x.id === id);
  document.getElementById('screen-themes').innerHTML = themeFormHtml(t);
  setHeader('themes', 'themes');
}

async function saveTheme(editId) {
  const body = {
    name: document.getElementById('th-name').value.trim(),
    description: document.getElementById('th-desc').value.trim(),
    source: document.getElementById('th-src').value.trim(),
  };
  if (!body.name) return alert('Name required');
  if (editId) await PUT(`/api/themes/${editId}`, body);
  else await POST('/api/themes', body);
  state.themes = await GET('/api/themes');
  nav('themes');
}

async function deleteTheme(id) {
  if (!confirm('Delete this theme? It will be removed from all events.')) return;
  await DELETE(`/api/themes/${id}`);
  state.themes = await GET('/api/themes');
  nav('themes');
}
```

- [ ] **Step 3: Seed starter themes**

Add this to `db.js` `initDb()` function, after the table creation:

```javascript
  // Seed starter themes if table is empty
  const existing = (await db.execute('SELECT COUNT(*) as count FROM themes')).rows[0];
  if (Number(existing.count) === 0) {
    const starterThemes = [
      ['Community Contribution', 'Activities where kids contribute meaningfully to family or community — doing real work alongside adults. From the Hunt Gather Parent idea that children thrive when they are genuinely needed.', 'Hunt Gather Parent'],
      ['Physical Challenge', 'Hard physical effort, testing limits, enduring discomfort. Builds resilience and a healthy confidence in the body — especially important for boys.', 'The Wonder of Boys'],
      ['Nature Connection', 'Unstructured time in nature — woods, water, fields. Reduces overstimulation and builds attention span and a sense of belonging in the natural world.', 'Simplicity Parenting'],
      ['Simplicity', 'Doing less, more slowly. Low-input, high-meaning experiences. Resisting over-scheduling culture and choosing depth over breadth.', 'Simplicity Parenting'],
      ['Wonder & Curiosity', "Experiences that spark awe and big questions — the sense that the world is larger than we know. Museums, science, wildlife, stargazing.", 'Multiple sources'],
      ['Social-Emotional Learning', 'Building emotional vocabulary, empathy, conflict resolution, and teamwork. Activities that require kids to work with others toward a shared goal.', 'Girls on the Run'],
      ['Autonomy & Risk-taking', "Letting kids navigate real risk and solve problems without adult rescue. Builds self-trust and the belief that they can handle hard things.", 'Let Them Grow'],
    ];
    for (const [name, description, source] of starterThemes) {
      await db.execute({ sql: 'INSERT INTO themes (name, description, source) VALUES (?,?,?)', args: [name, description, source] });
    }
  }
```

- [ ] **Step 4: Manual test**

```bash
# Open http://localhost:3000
# Tap Themes tab — 7 starter themes should appear
# Tap a theme → edit form with pre-filled fields
# Change description → Save → verify updated
# Tap Events → "Add event" → Step 2 → theme chips show all 7 themes
```

- [ ] **Step 5: Commit**

```bash
git add public/app.js db.js
git commit -m "feat: events list, themes management screen, and starter theme seeding"
```

---

## Task 11: Date Helpers + Final Polish

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add date utility functions to `app.js`**

```javascript
function isoDate(d) { return d.toISOString().split('T')[0]; }

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function nextWeekend(from) {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun, 6=Sat
  const daysToSat = day === 6 ? 0 : 6 - day;
  const sat = addDays(d, daysToSat);
  return { from: sat, to: addDays(sat, 1) };
}

function fmtShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDateRange() {
  const now = new Date();
  if (selectedPreset === 'weekend') return nextWeekend(now);
  if (selectedPreset === '2wk') return { from: now, to: addDays(now, 14) };
  if (selectedPreset === 'month') {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: now, to: end };
  }
  return {
    from: new Date(document.getElementById('cust-from').value),
    to: new Date(document.getElementById('cust-to').value),
  };
}
```

- [ ] **Step 2: Auto-refresh stale dates on search**

In `runSearch()`, after getting results, trigger background refresh for events with `last_fetched` older than 24 hours:

```javascript
// After: state.results = await GET(url);
// Fire-and-forget refresh for stale events
state.results
  .filter(e => {
    if (!e.last_fetched) return true;
    return Date.now() - new Date(e.last_fetched) > 24 * 60 * 60 * 1000;
  })
  .forEach(e => POST(`/api/ai/refresh/${e.id}`).catch(() => {}));
```

- [ ] **Step 3: Handle `?fb_connected` and `?fb_error` URL params in `init()`**

This is already in the `init()` function from Task 7. Verify it works:

```bash
# Manually visit: http://localhost:3000/?fb_connected=1
# Expected: alert "Facebook connected!" and URL cleaned to /
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat: date helpers, stale date auto-refresh, and final polish"
```

---

## Task 12: Deploy to Render

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: Create `render.yaml`**

```yaml
services:
  - type: web
    name: family-planner
    runtime: node
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: LIBSQL_URL
        sync: false
      - key: LIBSQL_AUTH_TOKEN
        sync: false
      - key: FB_APP_ID
        sync: false
      - key: FB_APP_SECRET
        sync: false
      - key: FB_REDIRECT_URI
        sync: false
      - key: BASE_URL
        sync: false
```

- [ ] **Step 2: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/family-planner.git
git push -u origin main
```

- [ ] **Step 3: Deploy on Render**

1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Render detects `render.yaml` automatically
4. Set environment variables:
   - `ANTHROPIC_API_KEY` — your Anthropic API key
   - `LIBSQL_URL` — your Turso database URL (`libsql://...`)
   - `LIBSQL_AUTH_TOKEN` — your Turso auth token
   - `FB_APP_ID` / `FB_APP_SECRET` — from your Facebook Developer App
   - `FB_REDIRECT_URI` — `https://your-render-url.onrender.com/auth/facebook/callback`
   - `BASE_URL` — `https://your-render-url.onrender.com`
5. Update Facebook Developer App's Valid OAuth Redirect URIs to include the Render URL

- [ ] **Step 4: Smoke test on mobile**

```
1. Open https://your-render-url.onrender.com on your phone
2. Add a theme (Themes tab → + Add)
3. Add an event (Events tab → + Add event → paste https://www.birkie.com/calendar/)
4. Search by date → event appears
5. Tap event → detail with message
6. Connect Facebook (if you have events there)
7. Search again → Facebook event appears
```

- [ ] **Step 5: Final commit**

```bash
git add render.yaml
git commit -m "chore: Render deployment config"
git push
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Query by date (preset windows + drive filter)
- ✅ Query by theme (theme chips + lookahead)
- ✅ Results with sort (date, drive, theme coverage)
- ✅ Dismiss / "Not for us" with restore
- ✅ Event detail with inline message editing
- ✅ Add/Edit two-step flow (URL fetch → AI analyze)
- ✅ Events list screen
- ✅ Themes screen with add/edit/delete
- ✅ Starter themes seeded
- ✅ Facebook Connect OAuth
- ✅ Date caching with 24h TTL + stale refresh
- ✅ Fetch error flag + "may be outdated" UI
- ✅ start_time / end_time fields
- ✅ Drive time as sortable integer, displayed as "1h 30m"
- ✅ Turso for SQLite persistence (no data loss on Render redeploy)
- ⬜ Calendar Builder (v2 — separate plan)
- ⬜ Anytime activities (v1.5 — separate plan)
