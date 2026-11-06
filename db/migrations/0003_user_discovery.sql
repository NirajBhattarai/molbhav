-- Buyer discovery preference: how their agent finds stalls.
-- Redis caches the same value with a short TTL; Postgres keeps it for the long term.

ALTER TABLE users
  ADD COLUMN discovery text NOT NULL DEFAULT 'nearby'
    CHECK (discovery IN ('location', 'nearby'));
