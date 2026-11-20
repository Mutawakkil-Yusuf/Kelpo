-- One like per visitor, keyed by a hashed IP. No raw addresses are stored.
CREATE TABLE likes (
  ip_hash    TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
