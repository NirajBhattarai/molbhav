-- Shopkeeper registration: people and their stall shell.
-- Open gate (enforced in app writes): name, UPI, and pin before is_open.

CREATE TABLE users (
  id         text PRIMARY KEY,               -- Magic issuer (did:ethr:0x…)
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stalls (
  id         text PRIMARY KEY,               -- e.g. u- + short uuid
  owner_id   text NOT NULL UNIQUE REFERENCES users (id),
  name       text NOT NULL DEFAULT '',
  lang       text NOT NULL DEFAULT 'en',
  style      text NOT NULL DEFAULT 'friendly'
               CHECK (style IN ('friendly', 'firm')),
  upi_id     text,
  upi_qr     text,
  agent_id   text UNIQUE,
  lat        double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng        double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  is_open    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stalls_open_pinned ON stalls (is_open)
  WHERE is_open AND lat IS NOT NULL AND lng IS NOT NULL;
