import { Router } from 'express';
import { fetchPageText } from '../services/fetcher.js';
import { extractDateFromPage, suggestThemesAndMessage } from '../services/ai.js';
import db from '../db.js';

const router = Router();

router.post('/fetch', async (req, res) => {
  const { url, timing_notes = '' } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  if (new URL(url).hostname.includes('facebook.com')) {
    const token = (await db.execute({
      sql: "SELECT access_token FROM auth_tokens WHERE provider='facebook'", args: []
    })).rows[0];
    if (!token) return res.status(401).json({ error: 'facebook_auth_required' });
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

router.post('/analyze', async (req, res) => {
  const { event_name, page_text } = req.body;
  const allThemes = (await db.execute('SELECT * FROM themes')).rows;
  if (!allThemes.length) return res.json({ theme_ids: [], message: '' });
  const result = await suggestThemesAndMessage(event_name, page_text || '', allThemes);
  res.json(result);
});

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
      args: [dateInfo.date ?? null, dateInfo.start_time ?? null, dateInfo.end_time ?? null, event.id]
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
