/**
 * Miner Cat 2 — standalone server
 *
 * Express backend for the Miner Cat 2 digging game.
 * - Accounts: username + bcrypt-hashed password + display name
 * - Cookie sessions (httpOnly)
 * - Server-side game saves, coins leaderboard
 * - Admin: the FIRST registered account automatically becomes admin/owner
 *          and gets a "developer" tag. Admin-only powers via /api/admin.
 *
 * Database: uses Postgres when DATABASE_URL is set (e.g. Neon on Render),
 * otherwise falls back to a local SQLite file via sql.js (WebAssembly, so it
 * runs on any Node version with zero native dependencies).
 *
 * Env vars:
 *   PORT         - port to listen on (hosts set this automatically)
 *   DATABASE_URL - Postgres connection string (persistent storage)
 *   DB_PATH      - SQLite file location for local fallback (default: ./data.sqlite)
 *
 * Security notes:
 * - Passwords are only ever handled as bcrypt hashes; raw passwords and
 *   hashes are never logged and never sent to clients.
 */
'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const SESSION_COOKIE = 'mc2_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_SAVE_BYTES = 200 * 1024;
const USE_PG = DATABASE_URL.length > 0;

// ---------------------------------------------------------------------------
// Database wrappers — both expose the same tiny async API:
//   db.exec(sql)
//   db.prepare(sql) -> { get(...params), all(...params), run(...params) }
// SQL uses `?` placeholders; the pg wrapper translates them to $1, $2, ...
// ---------------------------------------------------------------------------
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
}

function createPgDb(pool) {
  return {
    async exec(sql) {
      await pool.query(toPg(sql));
    },
    prepare(sql) {
      const text = toPg(sql);
      return {
        async get(...params) {
          const r = await pool.query(text, params);
          return r.rows[0];
        },
        async all(...params) {
          const r = await pool.query(text, params);
          return r.rows;
        },
        async run(...params) {
          const r = await pool.query(text, params);
          return { changes: r.rowCount || 0 };
        },
      };
    },
  };
}

function createSqlJsDb(SQL) {
  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    sqlDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    sqlDb = new SQL.Database();
  }

  function persist() {
    fs.writeFileSync(DB_PATH, Buffer.from(sqlDb.export()));
  }

  return {
    exec(sql) {
      sqlDb.exec(sql);
    },
    prepare(sql) {
      return {
        get(...params) {
          const stmt = sqlDb.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            return stmt.step() ? stmt.getAsObject() : undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params) {
          const stmt = sqlDb.prepare(sql);
          const rows = [];
          try {
            if (params.length) stmt.bind(params);
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params) {
          const stmt = sqlDb.prepare(sql);
          try {
            if (params.length) stmt.bind(params);
            stmt.step();
          } finally {
            stmt.free();
          }
          persist();
          return { changes: sqlDb.getRowsModified() };
        },
      };
    },
  };
}

const SCHEMA_SQLITE = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    is_owner      INTEGER NOT NULL DEFAULT 0,
    is_moderator  INTEGER NOT NULL DEFAULT 0,
    is_developer  INTEGER NOT NULL DEFAULT 0,
    banned        INTEGER NOT NULL DEFAULT 0,
    coins         INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS saves (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    save_json  TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_coins ON users (coins DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
  CREATE TABLE IF NOT EXISTS broadcasts (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    message    TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO broadcasts (id, message) VALUES (1, '');
  CREATE TABLE IF NOT EXISTS scores (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game    TEXT NOT NULL,
    score   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, game)
  );
  CREATE TABLE IF NOT EXISTS game_likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game    TEXT NOT NULL,
    PRIMARY KEY (user_id, game)
  );
  CREATE TABLE IF NOT EXISTS chat_servers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meteor_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug         TEXT NOT NULL,
    code         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at   TEXT
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL DEFAULT 'other',
    game       TEXT NOT NULL DEFAULT 'The whole site',
    message    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const SCHEMA_PG = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    is_owner      INTEGER NOT NULL DEFAULT 0,
    is_moderator  INTEGER NOT NULL DEFAULT 0,
    is_developer  INTEGER NOT NULL DEFAULT 0,
    banned        INTEGER NOT NULL DEFAULT 0,
    coins         INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS saves (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    save_json  TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_coins ON users (coins DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
  CREATE TABLE IF NOT EXISTS broadcasts (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    message    TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  INSERT INTO broadcasts (id, message) VALUES (1, '') ON CONFLICT (id) DO NOTHING;
  CREATE TABLE IF NOT EXISTS scores (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game    TEXT NOT NULL,
    score   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, game)
  );
  CREATE TABLE IF NOT EXISTS game_likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game    TEXT NOT NULL,
    PRIMARY KEY (user_id, game)
  );
  CREATE TABLE IF NOT EXISTS chat_servers (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS meteor_requests (
    id           SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug         TEXT NOT NULL,
    code         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at   TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL DEFAULT 'other',
    game       TEXT NOT NULL DEFAULT 'The whole site',
    message    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function main() {
  let db;
  if (USE_PG) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required by Neon and similar hosts
    });
    db = createPgDb(pool);
    await db.exec(SCHEMA_PG);
    console.log('Using Postgres database');
  } else {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    db = createSqlJsDb(SQL);
    db.exec(SCHEMA_SQLITE);
    console.log('Using local SQLite database at ' + DB_PATH);
  }

  // Migrations for existing databases
  try { await db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE users ADD COLUMN is_moderator INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE users ADD COLUMN is_developer INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  try { await db.exec('ALTER TABLE users ADD COLUMN hide_tags INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* already exists */ }
  // The owner is the first registered account and holds all four tags for real.
  // Backfill once so badge display can use the real flags (no admin implies owner).
  try { await db.exec('UPDATE users SET is_owner = 1, is_admin = 1, is_moderator = 1, is_developer = 1 WHERE id = (SELECT MIN(id) FROM users)'); } catch (e) { /* no users yet */ }
  try { await db.exec(`CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    message TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`); } catch (e) { /* already exists */ }

  const NOW = USE_PG ? 'NOW()' : "datetime('now')";

  // Prepared statements
  const stmtGetUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const stmtGetUserAuthByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const stmtCountUsers = db.prepare('SELECT COUNT(*) AS n FROM users');
  const stmtInsertUser = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, is_admin, is_owner, is_moderator, is_developer) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const stmtUpdateUserCoins = db.prepare('UPDATE users SET coins = ? WHERE id = ?');
  const stmtUpdateAccount = db.prepare('UPDATE users SET username = ?, display_name = ? WHERE id = ?');
  const stmtUpdatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const stmtGetSave = db.prepare('SELECT save_json, updated_at FROM saves WHERE user_id = ?');
  const stmtUpsertSave = db.prepare(
    'INSERT INTO saves (user_id, save_json, updated_at) VALUES (?, ?, ' + NOW + ')' +
    ' ON CONFLICT(user_id) DO UPDATE SET save_json = excluded.save_json, updated_at = ' + NOW
  );
  const stmtInsertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
  const stmtGetSession = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
  const stmtDeleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const stmtDeleteUserSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const stmtLeaderboard = db.prepare(
    'SELECT display_name, coins, is_admin, is_owner, is_moderator, is_developer, hide_tags FROM users ORDER BY coins DESC, created_at ASC LIMIT 50'
  );

  // -------------------------------------------------------------------------
  // App setup
  // -------------------------------------------------------------------------
  const app = express();
  app.set('trust proxy', 1); // needed behind a hosting proxy for secure cookies
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const isProd = process.env.NODE_ENV === 'production';
  function sessionCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd, // hosts serve over HTTPS
      maxAge: SESSION_TTL_MS,
      path: '/',
    };
  }

  // Very light in-memory rate limiter for auth endpoints (per IP).
  const attempts = new Map();
  function rateLimit(max, windowMs) {
    return (req, res, next) => {
      const key = req.ip || 'unknown';
      const now = Date.now();
      const entry = attempts.get(key) || { count: 0, resetAt: now + windowMs };
      if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + windowMs;
      }
      entry.count += 1;
      attempts.set(key, entry);
      if (entry.count > max) {
        return res.status(429).json({ error: 'Too many attempts, try again later.' });
      }
      next();
    };
  }

  function newSessionToken() {
    return crypto.randomBytes(32).toString('hex'); // 64 chars
  }

  async function createSession(res, userId) {
    const token = newSessionToken();
    await stmtInsertSession.run(token, userId, Date.now() + SESSION_TTL_MS);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  }

  // Attach req.user (public profile fields only) when a valid session exists.
  app.use(async (req, res, next) => {
    req.user = null;
    try {
      const token = req.cookies[SESSION_COOKIE];
      if (typeof token === 'string' && token.length === 64) {
        const row = await stmtGetSession.get(token);
        if (row && Number(row.expires_at) > Date.now()) {
          const user = await stmtGetUserById.get(row.user_id);
          if (user) req.user = user;
        } else if (row) {
          await stmtDeleteSession.run(token); // expired
        }
      }
    } catch (e) {
      console.error('session lookup failed:', e.message);
    }
    next();
  });

  function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    next();
  }

  function requireAdmin(req, res, next) {
    const u = req.user;
    if (!u || !(u.is_admin || u.is_moderator || u.is_developer || u.is_owner)) {
      return res.status(403).json({ error: 'Admin only.' });
    }
    next();
  }

  // Public profile shape — never includes password_hash.
  function publicProfile(u) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      isAdmin: !!u.is_admin,
      isOwner: !!u.is_owner,
      isModerator: !!u.is_moderator,
      isDeveloper: !!u.is_developer,
      hideTags: !!u.hide_tags,
      coins: u.coins,
    };
  }
  async function isOriginalOwner(userId) {
    const r = await db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    return r && r.id === userId;
  }

  // --- validation helpers ---------------------------------------------------
  function validUsername(v) {
    if (typeof v !== 'string') return false;
    const t = v.trim();
    return t.length >= 3 && t.length <= 32 && /^[A-Za-z0-9._\- ]+$/.test(t);
  }
  function validPassword(v) {
    return typeof v === 'string' && v.length >= 6 && v.length <= 128;
  }
  function validDisplayName(v) {
    return typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 24;
  }
  function coinsFromSave(save) {
    const c = Number(save && save.coins);
    return Number.isFinite(c) ? Math.max(0, Math.min(1e12, Math.floor(c))) : 0;
  }

  // -------------------------------------------------------------------------
  // Auth routes
  // -------------------------------------------------------------------------
  app.post('/api/signup', rateLimit(20, 10 * 60 * 1000), async (req, res) => {
    let { username, password, displayName } = req.body || {};
    if (typeof username === 'string') username = username.trim();
    if (!validUsername(username)) return res.status(400).json({ error: 'Username must be 3-32 chars (letters, numbers, spaces, . _ -).' });
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!validDisplayName(displayName)) return res.status(400).json({ error: 'Display name must be 1-24 characters.' });
    if (await stmtGetUserAuthByUsername.get(username)) {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    const countRow = await stmtCountUsers.get();
    const isFirst = Number(countRow.n) === 0;
    const hash = bcrypt.hashSync(password, 10);
    const f = isFirst ? 1 : 0; // the first account is the owner and holds all four tags
    await stmtInsertUser.run(username, hash, displayName.trim(), f, f, f, f);
    const authRow = await stmtGetUserAuthByUsername.get(username);
    const user = await stmtGetUserById.get(authRow.id);
    await createSession(res, user.id);
    const profile = publicProfile(user);
    profile.canGiveTags = await isOriginalOwner(user.id);
    res.status(201).json({ user: profile });
  });

  app.post('/api/signin', rateLimit(30, 10 * 60 * 1000), async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const row = await stmtGetUserAuthByUsername.get(username.trim());
    // Constant-time-ish failure path: always run a bcrypt compare.
    const ok = row ? bcrypt.compareSync(password, row.password_hash) : false;
    if (!ok) return res.status(401).json({ error: 'Invalid username or password.' });
    if (row.banned) return res.status(403).json({ error: 'This account has been banned.' });
    await createSession(res, row.id);
    const userRow = await stmtGetUserById.get(row.id);
    const signinProfile = publicProfile(userRow);
    signinProfile.canGiveTags = await isOriginalOwner(row.id);
    res.json({ user: signinProfile });
  });

  app.post('/api/signout', async (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (typeof token === 'string') await stmtDeleteSession.run(token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    const meProfile = publicProfile(req.user);
    meProfile.canGiveTags = await isOriginalOwner(req.user.id);
    res.json({ user: meProfile });
  });

  // -------------------------------------------------------------------------
  // Saves
  // -------------------------------------------------------------------------
  app.get('/api/save', requireAuth, async (req, res) => {
    const row = await stmtGetSave.get(req.user.id);
    if (!row) return res.status(404).json({ error: 'No save yet.' });
    res.json({ save: JSON.parse(row.save_json), updatedAt: row.updated_at });
  });

  app.post('/api/save', requireAuth, async (req, res) => {
    const { save } = req.body || {};
    if (!save || typeof save !== 'object' || Array.isArray(save)) {
      return res.status(400).json({ error: 'Invalid save data.' });
    }
    const json = JSON.stringify(save);
    if (json.length > MAX_SAVE_BYTES) {
      return res.status(413).json({ error: 'Save data too large.' });
    }
    await stmtUpsertSave.run(req.user.id, json);
    await stmtUpdateUserCoins.run(coinsFromSave(save), req.user.id);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Leaderboard — ranked by coins, shows display names (+ developer tag)
  // -------------------------------------------------------------------------
  app.get('/api/leaderboard', async (req, res) => {
    const rows = await stmtLeaderboard.all();
    res.json({
      leaderboard: rows.map((r) => ({
        displayName: r.display_name,
        coins: r.coins,
        tags: r.hide_tags ? {} : {
          owner: !!r.is_owner,
          admin: !!r.is_admin,
          moderator: !!r.is_moderator,
          developer: !!r.is_developer,
        },
      })),
    });
  });

  app.get('/api/broadcast', async (req, res) => {
    const row = await db.prepare('SELECT message FROM broadcasts WHERE id = 1').get();
    res.json({ message: row ? row.message : '' });
  });

  // -------------------------------------------------------------------------
  // Portal game scores — the Miner Cat account is the one site account.
  // -------------------------------------------------------------------------
  const PORTAL_GAMES = ['snake', 'breakout', 'flappy', 'memory', '2048', 'clicker', 'pong', 'minesweeper', 'invaders', 'lander', 'racer', 'blackjack', 'word', 'pursuit3d', 'clickersim'];
  const isPortalGame = game => PORTAL_GAMES.includes(game) || /^micro-[a-z0-9-]{3,50}$/.test(game);
  app.post('/api/scores', requireAuth, async (req, res) => {
    const game = String((req.body || {}).game || '');
    const score = Math.floor(Number((req.body || {}).score));
    if (!isPortalGame(game)) return res.status(400).json({ error: 'Unknown game.' });
    if (!Number.isFinite(score) || score < 0 || score > 1000000) return res.status(400).json({ error: 'Bad score.' });
    const existing = await db.prepare('SELECT score FROM scores WHERE user_id = ? AND game = ?').get(req.user.id, game);
    if (!existing) {
      await db.prepare('INSERT INTO scores (user_id, game, score) VALUES (?, ?, ?)').run(req.user.id, game, score);
    } else if (score > existing.score) {
      await db.prepare('UPDATE scores SET score = ? WHERE user_id = ? AND game = ?').run(score, req.user.id, game);
    }
    const mine = await db.prepare('SELECT score FROM scores WHERE user_id = ? AND game = ?').get(req.user.id, game);
    res.json({ ok: true, best: mine ? mine.score : score });
  });

  app.get('/api/scores/:game', async (req, res) => {
    const game = String(req.params.game || '');
    if (!isPortalGame(game)) return res.status(400).json({ error: 'Unknown game.' });
    const rows = await db.prepare(
      `SELECT u.display_name, u.is_owner, u.is_admin, u.is_moderator, u.is_developer, u.hide_tags, s.score
       FROM scores s JOIN users u ON u.id = s.user_id
       WHERE s.game = ? ORDER BY s.score DESC LIMIT 10`
    ).all(game);
    res.json({
      game,
      scores: rows.map((r) => ({
        displayName: r.display_name,
        score: r.score,
        tags: r.hide_tags ? {} : {
          owner: !!r.is_owner,
          admin: !!r.is_admin,
          moderator: !!r.is_moderator,
          developer: !!r.is_developer,
        },
      })),
    });
  });

  // -------------------------------------------------------------------------
  // Portal game likes — one like per player per game; counts are public.
  // -------------------------------------------------------------------------
  const LIKE_GAMES = [...PORTAL_GAMES, 'mining', 'chat', 'browser', 'settings', 'meteor', 'feedback'];
  app.get('/api/likes', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await db.prepare('SELECT game, COUNT(*) AS n FROM game_likes GROUP BY game').all();
    const counts = {};
    for (const r of rows) counts[r.game] = Number(r.n);
    let mine = [];
    if (req.user) {
      const my = await db.prepare('SELECT game FROM game_likes WHERE user_id = ?').all(req.user.id);
      mine = my.map((r) => r.game);
    }
    res.json({ counts, mine });
  });
  app.post('/api/likes', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const game = String((req.body || {}).game || '');
    if (!LIKE_GAMES.includes(game)) return res.status(400).json({ error: 'Unknown game.' });
    const existing = await db.prepare('SELECT user_id FROM game_likes WHERE user_id = ? AND game = ?').get(req.user.id, game);
    let liked;
    if (existing) {
      await db.prepare('DELETE FROM game_likes WHERE user_id = ? AND game = ?').run(req.user.id, game);
      liked = false;
    } else {
      await db.prepare('INSERT INTO game_likes (user_id, game) VALUES (?, ?)').run(req.user.id, game);
      liked = true;
    }
    const row = await db.prepare('SELECT COUNT(*) AS n FROM game_likes WHERE game = ?').get(game);
    res.json({ ok: true, game, liked, count: Number(row ? row.n : 0) });
  });

  // -------------------------------------------------------------------------
  // Arqade Chat servers — player-created chat rooms next to the public lobby.
  // The list is public; creating and deleting need a signed-in account.
  // -------------------------------------------------------------------------
  app.get('/api/chat/servers', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await db.prepare(
      'SELECT cs.id, cs.name, cs.owner_id, u.display_name AS owner_name FROM chat_servers cs JOIN users u ON u.id = cs.owner_id ORDER BY cs.id'
    ).all();
    const me = req.user;
    res.json({
      lobbyCount: lobbyRoomCount('lobby'),
      servers: rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        owner: r.owner_name,
        mine: !!me && Number(r.owner_id) === me.id,
        canDelete: !!me && (Number(r.owner_id) === me.id || !!me.is_admin || !!me.is_owner || !!me.is_moderator || !!me.is_developer),
        count: lobbyRoomCount('srv:' + r.id),
      })),
    });
  });

  app.post('/api/chat/servers', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const name = String((req.body || {}).name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 28) return res.status(400).json({ error: 'Server names are 2-28 characters.' });
    if (!/^[A-Za-z0-9][A-Za-z0-9 '\-.!]*$/.test(name)) return res.status(400).json({ error: 'Use letters, numbers, spaces and basic punctuation only.' });
    if (['public lobby', 'lobby', 'public', 'arqade chat'].includes(name.toLowerCase())) return res.status(400).json({ error: 'That name is reserved.' });
    const dupe = await db.prepare('SELECT id FROM chat_servers WHERE LOWER(name) = LOWER(?)').get(name);
    if (dupe) return res.status(409).json({ error: 'A server with that name already exists.' });
    const mineCount = await db.prepare('SELECT COUNT(*) AS n FROM chat_servers WHERE owner_id = ?').get(req.user.id);
    if (Number(mineCount ? mineCount.n : 0) >= 3) return res.status(400).json({ error: 'You can have up to 3 servers.' });
    await db.prepare('INSERT INTO chat_servers (name, owner_id) VALUES (?, ?)').run(name, req.user.id);
    const row = await db.prepare('SELECT id FROM chat_servers WHERE owner_id = ? AND name = ? ORDER BY id DESC LIMIT 1').get(req.user.id, name);
    res.json({ ok: true, server: { id: Number(row.id), name, owner: req.user.display_name, mine: true, canDelete: true, count: 0 } });
  });

  app.delete('/api/chat/servers/:id', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad server id.' });
    const row = await db.prepare('SELECT * FROM chat_servers WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'No such server.' });
    const u = req.user;
    if (!(Number(row.owner_id) === u.id || u.is_admin || u.is_owner || u.is_moderator || u.is_developer)) {
      return res.status(403).json({ error: 'Only the server owner or an admin can delete it.' });
    }
    await db.prepare('DELETE FROM chat_servers WHERE id = ?').run(id);
    kickLobbyRoom('srv:' + id);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Meteor 1.0 publishing — Meteor can push a NEW game page it generated
  // straight to GitHub (which auto-deploys the site). The OWNER publishes
  // directly. Players with the DEVELOPER tag get Code mode too, but their
  // pages go to the owner as a request (with a live preview) and only the
  // owner's approval publishes them. Hard limits for everyone: brand-new
  // public/games/<slug>.html files only, the file must not already exist,
  // complete HTML pages only, throttled. The key comes from the GITHUB_TOKEN
  // environment variable and never leaves this server.
  // -------------------------------------------------------------------------
  function requireOwner(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    if (!req.user.is_owner) return res.status(403).json({ error: 'Owner only.' });
    next();
  }
  function requireCoder(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    if (!(req.user.is_owner || req.user.is_developer)) return res.status(403).json({ error: 'Code mode is for the owner and developer-tag players.' });
    next();
  }
  function meteorPageError(slug, code) {
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) return 'Bad page name.';
    if (typeof code !== 'string' || code.length < 200 || code.length > 200000) return 'That code is the wrong size to publish.';
    if (!/^\s*<!DOCTYPE html>/i.test(code) || !/<\/html>\s*$/i.test(code.trim())) return 'Only complete game pages can be published.';
    return null;
  }
  async function meteorPublish(slug, code, via) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { ok: false, status: 503, error: 'Push is not set up on this server yet (no GITHUB_TOKEN).' };
    if (typeof fetch !== 'function') return { ok: false, status: 500, error: 'This server cannot reach GitHub from here.' };
    const apiUrl = 'https://api.github.com/repos/Dylan-Developer123/Arqade/contents/public/games/' + slug + '.html';
    const ghHeaders = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Arqade-Meteor-Publish' };
    try {
      const head = await fetch(apiUrl, { headers: ghHeaders });
      if (head.status === 200) return { ok: false, status: 409, error: 'A page with that name already exists — Meteor can only add new pages.' };
      if (head.status !== 404) return { ok: false, status: 502, error: 'GitHub check failed (' + head.status + '). The token may be wrong or expired.' };
      const put = await fetch(apiUrl, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Meteor 1.2: add game page ' + slug + (via ? ' (' + via + ')' : ''), content: Buffer.from(code, 'utf8').toString('base64') }),
      });
      if (!put.ok) return { ok: false, status: 502, error: 'GitHub refused the publish (' + put.status + ').' };
      const data = await put.json().catch(() => null);
      return { ok: true, commit: data && data.commit ? String(data.commit.sha).slice(0, 7) : null };
    } catch (e) {
      return { ok: false, status: 502, error: 'Could not reach GitHub just now. Try again in a bit.' };
    }
  }
  function meteorThrottle(map, userId, minGapMs, maxPerHour) {
    const now = Date.now();
    const log = (map.get(userId) || []).filter((t) => now - t < 3600 * 1000);
    if (log.length && now - log[log.length - 1] < minGapMs) return 'Slow down — one every 15 seconds.';
    if (log.length >= maxPerHour) return 'Limit reached for this hour.';
    log.push(now);
    map.set(userId, log);
    return null;
  }

  app.get('/api/meteor/push-status', requireOwner, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ available: !!process.env.GITHUB_TOKEN });
  });

  // Who can use Code mode, and how (direct publish vs request)?
  app.get('/api/meteor/access', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const u = req.user;
    res.json({
      code: !!(u.is_owner || u.is_developer),
      canPublish: !!u.is_owner,
      pushAvailable: !!process.env.GITHUB_TOKEN,
    });
  });

  const meteorPublishLog = new Map(); // owner direct publishes
  app.post('/api/meteor/publish', requireOwner, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const slug = String((req.body || {}).slug || '');
    const code = (req.body || {}).code;
    const bad = meteorPageError(slug, code);
    if (bad) return res.status(400).json({ error: bad });
    const slow = meteorThrottle(meteorPublishLog, req.user.id, 15000, 20);
    if (slow) return res.status(429).json({ error: slow });
    const r = await meteorPublish(slug, code, 'owner');
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    res.json({ ok: true, url: '/games/' + slug, commit: r.commit });
  });

  // Developer-tag players: send a page to the owner. The owner reviews the
  // requests in the Feedback app's Dev requests tab (with a live preview)
  // and approves (publishes) or denies them there.
  const meteorRequestLog = new Map();
  app.post('/api/meteor/request', requireCoder, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.user.is_owner) return res.status(400).json({ error: 'You are the owner — publish directly instead.' });
    const slug = String((req.body || {}).slug || '');
    const code = (req.body || {}).code;
    const bad = meteorPageError(slug, code);
    if (bad) return res.status(400).json({ error: bad });
    const slow = meteorThrottle(meteorRequestLog, req.user.id, 15000, 20);
    if (slow) return res.status(429).json({ error: slow });
    const pend = await db.prepare("SELECT COUNT(*) AS c FROM meteor_requests WHERE requester_id = ? AND status = 'pending'").get(req.user.id);
    if (Number(pend.c) >= 5) return res.status(400).json({ error: 'You already have 5 requests waiting. Dylan needs to decide those first.' });
    const dupe = await db.prepare("SELECT id FROM meteor_requests WHERE slug = ? AND status = 'pending'").get(slug);
    if (dupe) return res.status(409).json({ error: 'A page called "' + slug + '" is already waiting for Dylan.' });
    await db.prepare('INSERT INTO meteor_requests (requester_id, slug, code) VALUES (?, ?, ?)').run(req.user.id, slug, code);
    const row = await db.prepare('SELECT id FROM meteor_requests WHERE requester_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    res.json({ ok: true, id: Number(row.id) });
  });

  app.get('/api/meteor/my-requests', requireCoder, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await db.prepare('SELECT id, slug, status, created_at FROM meteor_requests WHERE requester_id = ? ORDER BY id DESC LIMIT 10').all(req.user.id);
    res.json({ requests: rows.map((r) => ({ id: Number(r.id), slug: r.slug, status: r.status, createdAt: r.created_at })) });
  });

  app.get('/api/meteor/requests', requireOwner, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await db.prepare(
      "SELECT mr.id, mr.slug, mr.status, mr.created_at, LENGTH(mr.code) AS code_len, u.display_name AS requester FROM meteor_requests mr JOIN users u ON u.id = mr.requester_id WHERE mr.status = 'pending' ORDER BY mr.id ASC"
    ).all();
    res.json({ requests: rows.map((r) => ({ id: Number(r.id), slug: r.slug, status: r.status, createdAt: r.created_at, codeLen: Number(r.code_len), requester: r.requester })) });
  });

  app.get('/api/meteor/requests/:id', requireOwner, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad request id.' });
    const row = await db.prepare(
      'SELECT mr.id, mr.slug, mr.code, mr.status, mr.created_at, u.display_name AS requester FROM meteor_requests mr JOIN users u ON u.id = mr.requester_id WHERE mr.id = ?'
    ).get(id);
    if (!row) return res.status(404).json({ error: 'No such request.' });
    res.json({ request: { id: Number(row.id), slug: row.slug, code: row.code, status: row.status, createdAt: row.created_at, requester: row.requester } });
  });

  app.post('/api/meteor/requests/:id/approve', requireOwner, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad request id.' });
    const row = await db.prepare('SELECT id, slug, code, status, requester_id FROM meteor_requests WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'No such request.' });
    if (row.status !== 'pending') return res.status(400).json({ error: 'That request was already ' + row.status + '.' });
    const slow = meteorThrottle(meteorPublishLog, req.user.id, 15000, 20);
    if (slow) return res.status(429).json({ error: slow });
    const r = await meteorPublish(row.slug, row.code, 'approved request from user ' + row.requester_id);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    await db.prepare("UPDATE meteor_requests SET status = 'approved', decided_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    res.json({ ok: true, slug: row.slug, commit: r.commit, url: '/games/' + row.slug });
  });

  app.post('/api/meteor/requests/:id/deny', requireOwner, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad request id.' });
    const row = await db.prepare('SELECT id, status FROM meteor_requests WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'No such request.' });
    if (row.status !== 'pending') return res.status(400).json({ error: 'That request was already ' + row.status + '.' });
    await db.prepare("UPDATE meteor_requests SET status = 'denied', decided_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Feedback app — everyone signed in can send feedback; the owner and
  // developer-tag players can read all of it; only the owner manages it.
  // -------------------------------------------------------------------------
  const FEEDBACK_TYPES = ['bug', 'idea', 'review', 'other'];
  const FEEDBACK_GAMES = ['The whole site', 'Mining Simulator', 'City Pursuit 3D', 'Turbo Racer 3D', 'Arqade Chat', 'Web Browser', 'Settings', 'Meteor AI', 'Feedback', 'Snake', 'Breakout', 'Flappy Bird', 'Memory Match', '2048', 'Coin Clicker', 'Pong', 'Minesweeper', 'Space Invaders', 'Lunar Lander', 'Blackjack', 'Word Guess'];
  const feedbackLog = new Map(); // userId -> recent submit timestamps

  app.get('/api/feedback/access', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const u = req.user;
    res.json({ canViewAll: !!(u.is_owner || u.is_developer), isOwner: !!u.is_owner });
  });

  app.post('/api/feedback', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const body = req.body || {};
    const type = FEEDBACK_TYPES.includes(body.type) ? body.type : 'other';
    const game = FEEDBACK_GAMES.includes(body.game) ? body.game : 'The whole site';
    const message = String(body.message || '').trim().replace(/\s+/g, ' ');
    if (message.length < 3 || message.length > 1000) return res.status(400).json({ error: 'Feedback is 3-1000 characters.' });
    const now = Date.now();
    const log = (feedbackLog.get(req.user.id) || []).filter((t) => now - t < 3600 * 1000);
    if (log.length && now - log[log.length - 1] < 10000) return res.status(429).json({ error: 'Slow down — one feedback every 10 seconds.' });
    if (log.length >= 20) return res.status(429).json({ error: 'Feedback limit reached for this hour.' });
    log.push(now);
    feedbackLog.set(req.user.id, log);
    await db.prepare('INSERT INTO feedback (user_id, type, game, message) VALUES (?, ?, ?, ?)').run(req.user.id, type, game, message);
    const row = await db.prepare('SELECT id FROM feedback WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
    res.json({ ok: true, id: Number(row.id) });
  });

  app.get('/api/feedback/mine', requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await db.prepare('SELECT id, type, game, message, status, created_at FROM feedback WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(req.user.id);
    res.json({ feedback: rows.map((r) => ({ id: Number(r.id), type: r.type, game: r.game, message: r.message, status: r.status, createdAt: r.created_at })) });
  });

  function requireFeedbackViewer(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    if (!(req.user.is_owner || req.user.is_developer)) return res.status(403).json({ error: 'Only the owner and developer-tag players can read all feedback.' });
    next();
  }

  app.get('/api/feedback/all', requireFeedbackViewer, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await db.prepare(
      'SELECT f.id, f.type, f.game, f.message, f.status, f.created_at, u.display_name AS author FROM feedback f JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 100'
    ).all();
    res.json({ feedback: rows.map((r) => ({ id: Number(r.id), type: r.type, game: r.game, message: r.message, status: r.status, createdAt: r.created_at, author: r.author })) });
  });

  app.patch('/api/feedback/:id', requireOwner, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad feedback id.' });
    const status = String((req.body || {}).status || '');
    if (!['new', 'seen', 'done'].includes(status)) return res.status(400).json({ error: 'Bad status.' });
    const row = await db.prepare('SELECT id FROM feedback WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'No such feedback.' });
    await db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id);
    res.json({ ok: true });
  });

  app.delete('/api/feedback/:id', requireOwner, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad feedback id.' });
    await db.prepare('DELETE FROM feedback WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Account settings — change username / display name / password
  // -------------------------------------------------------------------------
  app.patch('/api/account', requireAuth, async (req, res) => {
    let { currentPassword, username, displayName, newPassword } = req.body || {};
    if (typeof username === 'string') username = username.trim();
    const full = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const nextUsername = username !== undefined ? username : full.username;
    const nextDisplay = displayName !== undefined ? displayName : full.display_name;
    const changingSensitive = nextUsername !== full.username || (newPassword !== undefined && newPassword !== '');
    // Only require current password when changing username or password
    if (changingSensitive) {
      if (!full || !bcrypt.compareSync(String(currentPassword || ''), full.password_hash)) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
    }
    if (!validUsername(nextUsername)) return res.status(400).json({ error: 'Username must be 3-32 chars (letters, numbers, spaces, . _ -).' });
    if (!validDisplayName(nextDisplay)) return res.status(400).json({ error: 'Display name must be 1-24 characters.' });
    if (newPassword !== undefined && newPassword !== '' && !validPassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    if (nextUsername !== full.username && await stmtGetUserAuthByUsername.get(nextUsername)) {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    await stmtUpdateAccount.run(nextUsername, nextDisplay.trim(), req.user.id);
    if (newPassword) {
      await stmtUpdatePassword.run(bcrypt.hashSync(newPassword, 10), req.user.id);
      await stmtDeleteUserSessions.run(req.user.id); // force re-login everywhere
    }
    const user = await stmtGetUserById.get(req.user.id);
    if (newPassword) await createSession(res, user.id); // keep this device signed in
    const updatedProfile = publicProfile(user);
    updatedProfile.canGiveTags = await isOriginalOwner(user.id);
    res.json({ user: updatedProfile });
  });

  app.post('/api/toggle-tags', requireAuth, async (req, res) => {
    const hide = !!req.body.hide;
    await db.prepare('UPDATE users SET hide_tags = ? WHERE id = ?').run(hide ? 1 : 0, req.user.id);
    const user = await stmtGetUserById.get(req.user.id);
    const profile = publicProfile(user);
    profile.canGiveTags = await isOriginalOwner(user.id);
    res.json({ user: profile });
  });

  // -------------------------------------------------------------------------
  // Admin powers — server-enforced, admin accounts only
  // -------------------------------------------------------------------------
  app.post('/api/admin', requireAuth, requireAdmin, async (req, res) => {
    const { command, amount, pick, armor, bag } = req.body || {};
    const row = await stmtGetSave.get(req.user.id);
    const save = row ? JSON.parse(row.save_json) : {};
    const clamp = (v, lo, hi, dflt) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : dflt;
    };
    switch (command) {
      case 'coins':
        save.coins = clamp((save.coins || 0) + (amount || 0), 0, 1e9, 0);
        break;
      case 'gems':
        save.gems = clamp((save.gems || 0) + (amount || 0), 0, 1e9, 0);
        break;
      case 'god':
        save.god = !save.god;
        break;
      case 'achievements':
        save.achievements = ['rock-rookie', 'block-buster', 'mining-mogul', 'deep-paws', 'deep-diver', 'stage-explorer', 'big-swing', 'maxed-out', 'coin-starter', 'coin-tycoon', 'gem-hunter'];
        break;
      case 'heal':
        save.health = 100;
        break;
      case 'upgrades':
        if (pick !== undefined) save.pickLevel = clamp(pick, 1, 50, save.pickLevel || 1);
        if (armor !== undefined) save.armorLevel = clamp(armor, 1, 50, save.armorLevel || 1);
        if (bag !== undefined) save.bagLevel = clamp(bag, 1, 50, save.bagLevel || 1);
        save.enchants = { swift: 5, bouncy: 5, lucky: 5, hardy: 4, lava: 5 };
        break;
      case 'stage100':
        save.stage = 100;
        save.depth = 0;
        save.playerX = 10;
        save.playerY = 0;
        break;
      case 'wipe':
        // Delete ALL accounts, sessions, and saves. Next registration becomes admin.
        await db.prepare('DELETE FROM sessions').run();
        await db.prepare('DELETE FROM saves').run();
        await db.prepare('DELETE FROM users').run();
        return res.json({ ok: true, wiped: true });
      case 'ban':
      case 'unban': {
        const target = String(req.body.target || '').trim();
        if (!target) return res.status(400).json({ error: 'Username required.' });
        const victim = await db.prepare('SELECT id, is_admin, is_owner FROM users WHERE username = ?').get(target);
        if (!victim) return res.status(404).json({ error: 'Account not found.' });
        if (victim.id === req.user.id) return res.status(400).json({ error: 'You cannot ban yourself.' });
        if (victim.is_owner) return res.status(400).json({ error: 'Cannot ban the owner.' });
        if (victim.is_admin) return res.status(400).json({ error: 'Cannot ban an admin.' });
        const bannedVal = command === 'ban' ? 1 : 0;
        await db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(bannedVal, victim.id);
        if (bannedVal) await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(victim.id); // kick them out
        return res.json({ ok: true, banned: !!bannedVal, username: target });
      }
      case 'broadcast': {
        const msg = String(req.body.message || '').slice(0, 500);
        if (USE_PG) {
          await db.prepare('UPDATE broadcasts SET message = $1, updated_at = NOW() WHERE id = 1').run(msg);
        } else {
          await db.prepare("UPDATE broadcasts SET message = ?, updated_at = datetime('now') WHERE id = 1").run(msg);
        }
        return res.json({ ok: true, message: msg });
      }
      case 'gift': {
        const target = String(req.body.target || '').trim();
        if (!target) return res.status(400).json({ error: 'Username required.' });
        const giftCoins = clamp(req.body.coins, 0, 1e9, 0);
        const giftGems = clamp(req.body.gems, 0, 1e9, 0);
        if (!giftCoins && !giftGems) return res.status(400).json({ error: 'Enter an amount.' });
        const targetUser = await db.prepare('SELECT id FROM users WHERE username = ?').get(target);
        if (!targetUser) return res.status(404).json({ error: 'Account not found.' });
        const srow = await stmtGetSave.get(targetUser.id);
        const tsave = srow ? JSON.parse(srow.save_json) : {};
        tsave.coins = clamp((tsave.coins || 0) + giftCoins, 0, 1e9, 0);
        tsave.gems = clamp((tsave.gems || 0) + giftGems, 0, 1e9, 0);
        await stmtUpsertSave.run(targetUser.id, JSON.stringify(tsave));
        await stmtUpdateUserCoins.run(coinsFromSave(tsave), targetUser.id);
        return res.json({ ok: true, username: target, coins: giftCoins, gems: giftGems });
      }
      case 'reset': {
        const target = String(req.body.target || '').trim();
        if (!target) return res.status(400).json({ error: 'Username required.' });
        const targetUser = await db.prepare('SELECT id, is_admin, is_owner FROM users WHERE username = ?').get(target);
        if (!targetUser) return res.status(404).json({ error: 'Account not found.' });
        if (targetUser.is_owner && targetUser.id !== req.user.id) {
          return res.status(400).json({ error: 'Cannot reset the owner.' });
        }
        if (targetUser.is_admin && targetUser.id !== req.user.id) {
          return res.status(400).json({ error: 'Cannot reset another admin.' });
        }
        await db.prepare('DELETE FROM saves WHERE user_id = ?').run(targetUser.id);
        await db.prepare('UPDATE users SET coins = 0 WHERE id = ?').run(targetUser.id);
        await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUser.id); // force re-login
        return res.json({ ok: true, username: target, self: targetUser.id === req.user.id });
      }
      case 'tag': {
        // Only the original owner (first registered account) can give tags.
        const ownerRow = await db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
        if (!ownerRow || ownerRow.id !== req.user.id) {
          return res.status(403).json({ error: 'Only the owner can give tags.' });
        }
        const target = String(req.body.target || '').trim();
        const tag = String(req.body.tag || '').toLowerCase();
        const grant = req.body.grant !== false; // default to granting
        const validTags = { admin: 'is_admin', moderator: 'is_moderator', developer: 'is_developer' };
        if (!target) return res.status(400).json({ error: 'Username required.' });
        if (!validTags[tag]) return res.status(400).json({ error: 'Invalid tag. Use admin, moderator, or developer.' });
        const targetUser = await db.prepare('SELECT id, is_admin FROM users WHERE username = ?').get(target);
        if (!targetUser) return res.status(404).json({ error: 'Account not found.' });
        if (targetUser.id === req.user.id) return res.status(400).json({ error: 'You already have all tags.' });
        const col = validTags[tag];
        await db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(grant ? 1 : 0, targetUser.id);
        // Notify the user live via WebSocket if they're online
        const onlineUser = online.get(targetUser.id);
        if (onlineUser && onlineUser.ws.readyState === WebSocket.OPEN) {
          const updated = await stmtGetUserById.get(targetUser.id);
          const profile = publicProfile(updated);
          onlineUser.ws.send(JSON.stringify({ t: 'tags-updated', user: profile }));
          // Update their tags in the online map too
          onlineUser.tags = updated.hide_tags ? {} : {
            owner: !!updated.is_owner,
            admin: !!updated.is_admin,
            moderator: !!updated.is_moderator,
            developer: !!updated.is_developer,
          };
        }
        // Refresh everyone's leaderboard
        broadcast({ t: 'leaderboard-refresh' });
        return res.json({ ok: true, username: target, tag, granted: grant });
      }
      case 'resetScore': {
        // Per-game admin: clear the caller's own best score in one game.
        const game = String(req.body.game || '');
        const validGames = ['snake', 'breakout', 'flappy', 'memory', '2048', 'clicker', 'pong', 'minesweeper', 'invaders', 'lander', 'racer', 'blackjack', 'word', 'pursuit3d'];
        if (!validGames.includes(game)) return res.status(400).json({ error: 'Unknown game.' });
        await db.prepare('DELETE FROM scores WHERE user_id = ? AND game = ?').run(req.user.id, game);
        return res.json({ ok: true, game });
      }
      default:
        return res.status(400).json({ error: 'Unknown admin command.' });
    }
    const json = JSON.stringify(save);
    await stmtUpsertSave.run(req.user.id, json);
    await stmtUpdateUserCoins.run(coinsFromSave(save), req.user.id);
    res.json({ ok: true, save });
  });

  // -------------------------------------------------------------------------
  // Static frontend
  // -------------------------------------------------------------------------
  app.use(express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    setHeaders: (res, filePath) => { if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache'); }
  }));
  // SPA fallback: unknown non-API routes serve the game.
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const httpServer = app.listen(PORT, () => {
    console.log(`Miner Cat 2 listening on port ${PORT} (${USE_PG ? 'Postgres' : 'local SQLite'})`);
  });

  // -------------------------------------------------------------------------
  // Multiplayer — WebSocket server for live player positions and block breaks
  // -------------------------------------------------------------------------
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
  const online = new Map(); // userId -> { ws, username, displayName, x, y, stage, tags }
  const pursuit = new Map(); // City Pursuit room: userId -> { ws, username, displayName, tags, state }
  const lobbyRooms = new Map(); // Arqade Chat rooms: roomKey ('lobby' or 'srv:<id>') -> Map(userId -> { ws, displayName, tags, voiceOn, lastChat })
  function lobbyRoom(key) {
    let r = lobbyRooms.get(key);
    if (!r) { r = new Map(); lobbyRooms.set(key, r); }
    return r;
  }
  function lobbyRoomCount(key) {
    const r = lobbyRooms.get(key);
    return r ? r.size : 0;
  }
  function kickLobbyRoom(key) {
    const r = lobbyRooms.get(key);
    if (!r) return;
    for (const q of r.values()) {
      try { q.ws.send(JSON.stringify({ t: 'servergone' })); } catch (e) {}
      try { q.ws.close(4002, 'Server deleted'); } catch (e) {}
    }
    lobbyRooms.delete(key);
  }

  function broadcast(msg, exceptId) {
    const data = JSON.stringify(msg);
    for (const [id, p] of online) {
      if (id === exceptId) continue;
      if (p.ws.readyState === WebSocket.OPEN) p.ws.send(data);
    }
  }

  // -------------------------------------------------------------------------
  // Meteor 1.0 — Arqade's AI as a bot player in both multiplayer worlds.
  // A server-run fake player (stub socket): wanders + mines in the Mining
  // Simulator world, and drives a loop around the central block in City
  // Pursuit. Real clients render it exactly like any other player.
  // -------------------------------------------------------------------------
  const METEOR_ID = 'meteor';
  const meteorStubWs = { readyState: 1, send: () => {}, close: () => {} };

  // --- Mining Simulator world bot (stage 1001, around spawn) ---
  const minerBot = {
    ws: meteorStubWs, id: METEOR_ID, username: 'meteor', displayName: 'Meteor 1.2',
    x: 12.5, y: -0.5, stage: 1001, tags: {},
    dir: 1, targetX: 17, jumpT: -1, nextMineAt: Date.now() + 9000, mineStepAt: 0, mineX: null,
  };
  online.set(METEOR_ID, minerBot);
  setInterval(() => {
    if (online.size <= 1) return; // nobody watching — rest
    const dt = 0.25;
    const dx = minerBot.targetX - minerBot.x;
    if (Math.abs(dx) < 0.3) {
      minerBot.targetX = 5 + Math.random() * 15; // wander x 5..20 near spawn
    } else {
      minerBot.dir = dx > 0 ? 1 : -1;
      minerBot.x += minerBot.dir * Math.min(Math.abs(dx), 2.1 * dt);
      if (minerBot.jumpT < 0 && Math.random() < 0.012) minerBot.jumpT = 0; // little hop
    }
    if (minerBot.jumpT >= 0) {
      minerBot.jumpT += dt / 0.55;
      if (minerBot.jumpT >= 1) { minerBot.jumpT = -1; minerBot.y = -0.5; }
      else minerBot.y = -0.5 - Math.sin(minerBot.jumpT * Math.PI) * 0.85;
    }
    broadcast({ t: 'pos', id: METEOR_ID, x: +minerBot.x.toFixed(2), y: +minerBot.y.toFixed(2), stage: 1001 }, METEOR_ID);
    // Mining: every ~10-17s, dig the grass + dirt in front (two-step)
    const now = Date.now();
    if (!minerBot.mineStepAt && now >= minerBot.nextMineAt && minerBot.jumpT < 0) {
      minerBot.mineX = Math.floor(minerBot.x) + minerBot.dir;
      broadcast({ t: 'break', stage: 1001, x: minerBot.mineX, y: 0, by: 'meteor' }, METEOR_ID);
      minerBot.mineStepAt = now + 1100;
    } else if (minerBot.mineStepAt && now >= minerBot.mineStepAt) {
      broadcast({ t: 'break', stage: 1001, x: minerBot.mineX, y: 1, by: 'meteor' }, METEOR_ID);
      minerBot.mineStepAt = 0;
      minerBot.nextMineAt = now + 10000 + Math.random() * 7000;
    }
  }, 250);

  // --- City Pursuit bot car: right-hand-traffic loop around the central block ---
  const pursuitBot = {
    ws: meteorStubWs, id: METEOR_ID, username: 'meteor', displayName: 'Meteor 1.2', tags: {},
    voiceOn: false, lastChat: 0,
    x: -3.6, z: 30, a: Math.PI, wp: 0, // start on Main St heading south (+Z)
    state: { mode: 'drive', x: -3.6, y: 0, z: 30, a: Math.PI, c: 0xf97316, mv: 1, hide: 0, cop: 0 },
  };
  pursuit.set(METEOR_ID, pursuitBot);
  const PURSUIT_WPS = [[-3.6, 68.4], [68.4, 75.6], [75.6, 3.6], [-3.6, -3.6]];
  function pursuitBotBroadcast(obj) {
    const data = JSON.stringify(obj);
    for (const q of pursuit.values()) {
      if (q.id === METEOR_ID) continue;
      if (q.ws.readyState === WebSocket.OPEN) q.ws.send(data);
    }
  }
  setInterval(() => {
    const dt = 0.1;
    const [tx, tz] = PURSUIT_WPS[pursuitBot.wp];
    const dx = tx - pursuitBot.x, dz = tz - pursuitBot.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) { pursuitBot.wp = (pursuitBot.wp + 1) % PURSUIT_WPS.length; return; }
    const want = Math.atan2(-dx / dist, -dz / dist);
    let diff = want - pursuitBot.a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-1.7 * dt, Math.min(1.7 * dt, diff));
    pursuitBot.a += turn;
    const spd = 15 - Math.min(6, Math.abs(diff) * 4); // ease off in corners
    pursuitBot.x += -Math.sin(pursuitBot.a) * spd * dt;
    pursuitBot.z += -Math.cos(pursuitBot.a) * spd * dt;
    pursuitBot.state = {
      mode: 'drive', x: +pursuitBot.x.toFixed(2), y: 0, z: +pursuitBot.z.toFixed(2),
      a: +pursuitBot.a.toFixed(3), c: 0xf97316, mv: 1, hide: 0, cop: 0,
    };
    if (pursuit.size > 1) {
      pursuitBotBroadcast({ t: 'ppos', id: METEOR_ID, displayName: 'Meteor 1.2', tags: {}, ...pursuitBot.state });
    }
  }, 100);

  wss.on('connection', async (ws, req) => {
    // Auth via session cookie
    let userId = null;
    try {
      const cookies = (req.headers.cookie || '').split(';').map((c) => c.trim());
      const sessCookie = cookies.find((c) => c.startsWith(SESSION_COOKIE + '='));
      if (sessCookie) {
        const token = sessCookie.slice(SESSION_COOKIE.length + 1);
        const srow = await stmtGetSession.get(token);
        if (srow && Number(srow.expires_at) > Date.now()) {
          const u = await stmtGetUserById.get(srow.user_id);
          if (u && !u.banned) userId = u.id;
        }
      }
    } catch (e) {}
    if (!userId) { ws.close(4001, 'Not authenticated'); return; }

    const user = await stmtGetUserById.get(userId);

    // ---- City Pursuit 3D room (?game=pursuit): relay car/foot state, keep out of the Miner Cat world ----
    let gameParam = '';
    let roomParam = '';
    try {
      const u2 = new URL(req.url, 'http://localhost');
      gameParam = u2.searchParams.get('game') || '';
      roomParam = u2.searchParams.get('room') || '';
    } catch (e) {}
    if (gameParam === 'lobby') {
      // Custom chat servers: ?room=<chat_servers id>; anything else lands in the public lobby.
      let roomKey = 'lobby';
      if (roomParam && roomParam !== 'lobby') {
        const sid = parseInt(roomParam, 10);
        const srow = Number.isInteger(sid) ? await db.prepare('SELECT id FROM chat_servers WHERE id = ?').get(sid) : null;
        if (!srow) { ws.close(4003, 'No such server'); return; }
        roomKey = 'srv:' + sid;
      }
      const lobby = lobbyRoom(roomKey);
      const tags = user.hide_tags ? {} : {
        owner: !!user.is_owner, admin: !!user.is_admin,
        moderator: !!user.is_moderator, developer: !!user.is_developer,
      };
      const lp = { ws, id: userId, username: user.username, displayName: user.display_name, tags, voiceOn: false, lastChat: 0 };
      if (lobby.has(userId)) { try { lobby.get(userId).ws.close(); } catch (e) {} }
      lobby.set(userId, lp);
      const lothers = [...lobby.values()].filter((q) => q.id !== userId).map((q) => ({
        id: q.id, displayName: q.displayName, tags: q.tags, voice: !!q.voiceOn,
      }));
      ws.send(JSON.stringify({ t: 'lwelcome', id: userId, room: roomKey, players: lothers }));
      const toLobby = (obj, except) => {
        const data = JSON.stringify(obj);
        for (const q of lobby.values()) {
          if (q.id === except) continue;
          if (q.ws.readyState === WebSocket.OPEN) q.ws.send(data);
        }
      };
      for (const q of lobby.values()) {
        if (q.id !== userId && q.ws.readyState === WebSocket.OPEN) {
          q.ws.send(JSON.stringify({ t: 'ljoin', player: { id: lp.id, displayName: lp.displayName, tags: lp.tags, voice: false } }));
        }
      }
      ws.on('message', (raw) => {
        if (raw.length > 20000) return;
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        const me = lobby.get(userId);
        if (!me || me.ws !== ws) return;
        if (msg.t === 'chat') {
          const now = Date.now();
          if (now - me.lastChat < 350) return;
          const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 200) : '';
          if (!text) return;
          me.lastChat = now;
          toLobby({ t: 'chat', id: userId, displayName: me.displayName, text }, null);
        } else if (msg.t === 'voice') {
          me.voiceOn = !!msg.on;
          toLobby({ t: 'voice', id: userId, displayName: me.displayName, on: me.voiceOn }, userId);
        } else if (msg.t === 'rtc') {
          const target = lobby.get(msg.to | 0);
          if (target && target.ws.readyState === WebSocket.OPEN && msg.data && typeof msg.data === 'object') {
            target.ws.send(JSON.stringify({ t: 'rtc', from: userId, displayName: me.displayName, data: msg.data }));
          }
        }
      });
      ws.on('close', () => {
        if (lobby.get(userId)?.ws === ws) {
          lobby.delete(userId);
          toLobby({ t: 'lleave', id: userId });
          if (lobby.size === 0 && roomKey !== 'lobby') lobbyRooms.delete(roomKey);
        }
      });
      return;
    }

    if (gameParam === 'pursuit') {
      const tags = user.hide_tags ? {} : {
        owner: !!user.is_owner, admin: !!user.is_admin,
        moderator: !!user.is_moderator, developer: !!user.is_developer,
      };
      const pp = { ws, id: userId, username: user.username, displayName: user.display_name, tags, state: null, voiceOn: false, lastChat: 0 };
      if (pursuit.has(userId)) { try { pursuit.get(userId).ws.close(); } catch (e) {} }
      pursuit.set(userId, pp);
      console.log(`[ws-pursuit] ${pp.username} joined (${pursuit.size} in city)`);
      const others = [...pursuit.values()].filter((q) => q.id !== userId).map((q) => ({
        id: q.id, displayName: q.displayName, tags: q.tags, state: q.state, voice: !!q.voiceOn,
      }));
      ws.send(JSON.stringify({ t: 'pwelcome', id: userId, players: others }));
      for (const q of pursuit.values()) {
        if (q.id !== userId && q.ws.readyState === WebSocket.OPEN) {
          q.ws.send(JSON.stringify({ t: 'pjoin', player: { id: pp.id, displayName: pp.displayName, tags: pp.tags, state: null, voice: false } }));
        }
      }
      const toRoom = (obj, except) => {
        const data = JSON.stringify(obj);
        for (const q of pursuit.values()) {
          if (q.id === except) continue;
          if (q.ws.readyState === WebSocket.OPEN) q.ws.send(data);
        }
      };
      // Meteor 1.0 greets each driver who enters the city
      setTimeout(() => {
        if (pursuit.get(userId)?.ws === ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: 'chat', id: METEOR_ID, displayName: 'Meteor 1.2', text: 'Hey ' + pp.displayName + '! ☄️ I\'m Meteor 1.0 — I\'m driving the orange car. Catch me if you can!' }));
        }
      }, 1200);
      ws.on('message', (raw) => {
        if (raw.length > 20000) return;
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        const me = pursuit.get(userId);
        if (!me || me.ws !== ws) return;
        if (msg.t === 'ppos') {
          me.state = {
            mode: msg.mode === 'foot' ? 'foot' : 'drive',
            x: +msg.x || 0, y: +msg.y || 0, z: +msg.z || 0, a: +msg.a || 0,
            c: msg.c | 0, mv: msg.mv ? 1 : 0, hide: msg.hide ? 1 : 0, cop: msg.cop ? 1 : 0,
          };
          toRoom({ t: 'ppos', id: userId, displayName: me.displayName, tags: me.tags, ...me.state }, userId);
        } else if (msg.t === 'pevent' && (msg.kind === 'busted' || msg.kind === 'wasted')) {
          toRoom({ t: 'pevent', id: userId, displayName: me.displayName, kind: msg.kind }, userId);
        } else if (msg.t === 'chat') {
          const now = Date.now();
          if (now - me.lastChat < 350) return;
          const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 200) : '';
          if (!text) return;
          me.lastChat = now;
          toRoom({ t: 'chat', id: userId, displayName: me.displayName, text }, null);
        } else if (msg.t === 'voice') {
          me.voiceOn = !!msg.on;
          toRoom({ t: 'voice', id: userId, displayName: me.displayName, on: me.voiceOn }, userId);
        } else if (msg.t === 'rtc') {
          const target = pursuit.get(msg.to | 0);
          if (target && target.ws.readyState === WebSocket.OPEN && msg.data && typeof msg.data === 'object') {
            target.ws.send(JSON.stringify({ t: 'rtc', from: userId, displayName: me.displayName, data: msg.data }));
          }
        }
      });
      ws.on('close', () => {
        if (pursuit.get(userId)?.ws === ws) {
          pursuit.delete(userId);
          toRoom({ t: 'pleave', id: userId });
          console.log(`[ws-pursuit] ${pp.username} left (${pursuit.size} in city)`);
        }
      });
      return;
    }

    const player = {
      ws,
      id: userId,
      username: user.username,
      displayName: user.display_name,
      x: 10.5, y: -0.5, stage: 1,
      tags: user.hide_tags ? {} : {
        owner: !!user.is_owner,
        admin: !!user.is_admin,
        moderator: !!user.is_moderator,
        developer: !!user.is_developer,
      },
    };
    // Replace old connection if re-connecting
    if (online.has(userId)) { try { online.get(userId).ws.close(); } catch (e) {} }
    online.set(userId, player);
    console.log(`[ws] ${player.username} joined (${online.size} online)`);

    // Send current players to the newcomer
    const others = [...online.values()].filter((p) => p.id !== userId).map((p) => ({
      id: p.id, username: p.username, displayName: p.displayName,
      x: p.x, y: p.y, stage: p.stage, tags: p.tags,
    }));
    ws.send(JSON.stringify({ t: 'welcome', id: userId, players: others }));
    // Announce to others
    broadcast({ t: 'join', player: { id: player.id, username: player.username, displayName: player.displayName, x: player.x, y: player.y, stage: player.stage, tags: player.tags } }, userId);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      const p = online.get(userId);
      if (!p) return;
      if (msg.t === 'pos' && typeof msg.x === 'number' && typeof msg.y === 'number') {
        p.x = msg.x; p.y = msg.y; p.stage = msg.stage | 0;
        // Broadcast to others on the same stage
        broadcast({ t: 'pos', id: userId, x: p.x, y: p.y, stage: p.stage }, userId);
      } else if (msg.t === 'break' && Number.isInteger(msg.x) && Number.isInteger(msg.y)) {
        // Relay block break to others on the same stage
        broadcast({ t: 'break', stage: msg.stage | 0, x: msg.x, y: msg.y, by: player.username }, userId);
      } else if (msg.t === 'voice-join' || msg.t === 'voice-leave') {
        // Voice presence — tell others in the lounge
        broadcast({ t: msg.t, from: userId, username: player.username }, userId);
      } else if ((msg.t === 'voice-offer' || msg.t === 'voice-answer' || msg.t === 'voice-ice') && msg.to) {
        // Direct signaling messages
        const target = online.get(msg.to);
        if (target && target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(JSON.stringify({ ...msg, from: userId }));
        }
      }
    });

    ws.on('close', () => {
      if (online.get(userId)?.ws === ws) {
        online.delete(userId);
        broadcast({ t: 'leave', id: userId });
        console.log(`[ws] ${player.username} left (${online.size} online)`);
      }
    });
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { createPgDb, createSqlJsDb, toPg, SCHEMA_PG, SCHEMA_SQLITE };
