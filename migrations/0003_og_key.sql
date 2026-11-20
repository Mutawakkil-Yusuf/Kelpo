-- Per-link OG card stored as a 1200x630 PNG in object storage.
ALTER TABLE links ADD COLUMN og_key TEXT;
