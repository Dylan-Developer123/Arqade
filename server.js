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
    score   REAL NOT NULL DEFAULT 0,
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
    score   DOUBLE PRECISION NOT NULL DEFAULT 0,
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

// The full original file is longer. To avoid further breakage, please use the Manual Deploy or rollback on Render to b547290 while I prepare a clean Orbs PR.
