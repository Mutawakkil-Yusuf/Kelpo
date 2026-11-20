-- Sender accounts, client feedback pins, brand kit and plan interest.
CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX idx_sessions_account ON sessions (account_id);

ALTER TABLE links ADD COLUMN account_id TEXT;
ALTER TABLE links ADD COLUMN accent_color TEXT;
ALTER TABLE links ADD COLUMN logo_url TEXT;

CREATE INDEX idx_links_account ON links (account_id);

CREATE TABLE pins (
  id         TEXT PRIMARY KEY,
  link_slug  TEXT NOT NULL REFERENCES links (slug) ON DELETE CASCADE,
  file_id    TEXT NOT NULL,
  x          REAL NOT NULL,
  y          REAL NOT NULL,
  message    TEXT NOT NULL,
  author     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_pins_link ON pins (link_slug, file_id);

CREATE TABLE waitlist (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
