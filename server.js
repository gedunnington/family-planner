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
app.use((_, res) => res.sendFile(join(__dirname, 'public', 'index.html')));

export { app };

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  initDb().then(() => app.listen(PORT, () => console.log(`Running on port ${PORT}`)));
}
