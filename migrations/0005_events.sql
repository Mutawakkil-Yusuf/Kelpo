-- Product funnel events. One unique open per link per browser session.
CREATE TABLE events (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL,
  type       TEXT NOT NULL,
  session_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_events_slug_type ON events (slug, type, created_at);

CREATE UNIQUE INDEX idx_events_open_session
  ON events (slug, session_id)
  WHERE type = 'opened' AND session_id IS NOT NULL;
