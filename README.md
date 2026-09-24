# BANKNIFTY Journal

Single Node.js + Express server, Postgres for storage, and the journal
front end (`public/index.html`). All journal data — trades, settings,
broker list, cooldown timer — is stored server-side, so it's the same on
every device/browser you open the app from.

A single login (one username/password, set via environment variables)
gates both the page and the API. Sessions are stored in Postgres too, so
logins survive server restarts (Render/Railway free tiers spin the
service down when idle).

## Local run

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET
npm start
```

Visit `http://localhost:3000` — you'll land on `/login` first.

## Deploy on Render

1. Push this folder to a GitHub repo.
2. Render dashboard → **New → PostgreSQL** → create a free instance. Copy
   its **Internal Database URL**.
3. Render dashboard → **New → Web Service** → connect the repo.
   - Build command: `npm install`
   - Start command: `npm start`
4. In the web service's **Environment** tab, add:
   - `DATABASE_URL` — from step 2
   - `ADMIN_USERNAME` — whatever you want to log in with
   - `ADMIN_PASSWORD` — a strong password
   - `SESSION_SECRET` — any long random string
   - `NODE_ENV` = `production`
5. Deploy. Render gives you a public `https://...onrender.com` URL.

## Deploy on Railway

1. Push this folder to a GitHub repo.
2. Railway dashboard → **New Project → Deploy from GitHub repo**.
3. In the same project, **New → Database → Add PostgreSQL**.
4. On your web service, go to **Variables** and add:
   - `DATABASE_URL` — reference the Postgres plugin, e.g. `${{Postgres.DATABASE_URL}}`
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` — as above
   - `NODE_ENV` = `production`
5. Railway auto-detects Node and runs `npm start`. Generate a public
   domain from the service's **Settings → Networking** tab.

## Notes

- `kv_store` (your data) and `session` (login sessions) tables are
  created automatically on first boot — no manual migration needed.
- Lot size (35) is hardcoded in `public/index.html` — search for `LOT`
  if it changes.
- Only one account is supported (single username/password from env
  vars) — this is a personal journal, not a multi-user app.
- Trades, settings, brokers, and cooldown are each stored as one JSON
  value under a fixed key. That's plenty for one person's personal
  journal; if trade volume gets very large it could later be split into
  a proper `trades` table, but there's no need for that now.
