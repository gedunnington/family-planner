import { Router } from 'express';
import { getFacebookAuthUrl, exchangeCodeForToken } from '../services/facebook.js';
import db from '../db.js';

const router = Router();

router.get('/facebook', (req, res) => {
  const url = getFacebookAuthUrl(process.env.FB_APP_ID, process.env.FB_REDIRECT_URI);
  res.redirect(url);
});

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

router.get('/facebook/status', async (_, res) => {
  const row = (await db.execute({
    sql: "SELECT expires_at FROM auth_tokens WHERE provider='facebook'", args: []
  })).rows[0];
  res.json({ connected: !!row, expires_at: row?.expires_at || null });
});

router.delete('/facebook', async (_, res) => {
  await db.execute({ sql: "DELETE FROM auth_tokens WHERE provider='facebook'", args: [] });
  res.status(204).end();
});

export default router;
