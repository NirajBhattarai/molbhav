-- What a stall sells. `price` is the asking (start) price; `lowest` is the absolute floor
-- the agent never goes below and never says out loud. Soft-delete via `active`.

CREATE TABLE stall_items (
  id         serial PRIMARY KEY,
  stall_id   text NOT NULL REFERENCES stalls (id),
  name       text NOT NULL,
  words      text NOT NULL DEFAULT '',       -- other names buyers may type (chai, tea…)
  price      integer NOT NULL CHECK (price > 0),
  lowest     integer NOT NULL CHECK (lowest > 0 AND lowest <= price),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stall_items_live ON stall_items (stall_id, id) WHERE active;
