require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const app = express();
app.use(express.json());

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add a Postgres instance and set this env var.');
  process.exit(1);
}
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
  console.error('ADMIN_USERNAME and ADMIN_PASSWORD must be set to enable login.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render/Railway managed Postgres require SSL; local Postgres usually doesn't.
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

app.set('trust proxy', 1); // Render/Railway sit behind a proxy — needed for secure cookies
app.use(
  session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requirePageAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.redirect('/login');
}

function requireApiAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

app.get('/login', (req, res) => {
  if (req.session && req.session.loggedIn) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const ok =
    typeof username === 'string' &&
    typeof password === 'string' &&
    timingSafeEqual(username, process.env.ADMIN_USERNAME) &&
    timingSafeEqual(password, process.env.ADMIN_PASSWORD);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  req.session.loggedIn = true;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.loggedIn) });
});

app.get('/', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// All journal data (trades list, settings, brokers, cooldown) is stored as
// JSON blobs under a small number of keys — same shape the app used with
// localStorage, just persisted centrally so every device sees the same data.
app.get('/api/kv/:key', requireApiAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT value FROM kv_store WHERE key = $1',
      [req.params.key]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json({ key: req.params.key, value: rows[0].value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.put('/api/kv/:key', requireApiAuth, async (req, res) => {
  const { value } = req.body || {};
  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value must be a string' });
  }
  try {
    await pool.query(
      `INSERT INTO kv_store (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.params.key, value]
    );
    res.json({ key: req.params.key, value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Journal server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
