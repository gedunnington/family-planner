import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.LIBSQL_URL || 'file:./data.db',
  authToken: process.env.LIBSQL_AUTH_TOKEN || undefined,
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

  // Seed starter themes on first run (skip in test environment)
  if (process.env.NODE_ENV !== 'test') {
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
        await db.execute({
          sql: 'INSERT INTO themes (name, description, source) VALUES (?,?,?)',
          args: [name, description, source],
        });
      }
    }
  }
}

export default db;
