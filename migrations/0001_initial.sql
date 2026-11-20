-- Kelpo initial schema. Apply locally with `pnpm db:local`.

CREATE TABLE links (
  slug              TEXT PRIMARY KEY,          -- URL-safe capability token (>=16 chars)
  title             TEXT NOT NULL,
  message           TEXT,
  password_salt     TEXT,                      -- base64; NULL when unprotected
  password_hash     TEXT,                      -- PBKDF2 base64; NULL when unprotected
  owner_token_hash  TEXT NOT NULL,             -- hashed sender token; claimable in phase 2
  expected_files    INTEGER NOT NULL DEFAULT 0,
  expires_at        INTEGER NOT NULL,          -- epoch milliseconds
  created_at        INTEGER NOT NULL,          -- epoch milliseconds
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft', 'active', 'disabled', 'expired', 'deleted')),
  view_count        INTEGER NOT NULL DEFAULT 0,
  report_count      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_links_expiry ON links (expires_at) WHERE status = 'active';

CREATE TABLE files (
  id            TEXT PRIMARY KEY,
  link_slug     TEXT NOT NULL REFERENCES links (slug) ON DELETE CASCADE,
  r2_key        TEXT NOT NULL UNIQUE,          -- <slug>/<id>-<safe-name>
  thumb_key     TEXT,                          -- <slug>/<id>-thumb.webp
  name          TEXT NOT NULL,                 -- original filename for download
  content_type  TEXT NOT NULL,                -- sniffed, not client-declared
  size_bytes    INTEGER NOT NULL,
  width         INTEGER,                      -- images only, for gallery layout
  height        INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_files_link ON files (link_slug, sort_order);

CREATE TABLE rate_events (
  ip_hash     TEXT NOT NULL,                  -- hashed IP, never stored raw
  action      TEXT NOT NULL,                  -- 'create' | 'password_fail' | 'report'
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_rate_lookup ON rate_events (ip_hash, action, created_at);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  link_slug   TEXT NOT NULL REFERENCES links (slug) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  ip_hash     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_reports_link ON reports (link_slug);
