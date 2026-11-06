-- Stall agents over A2A: outside agents bargain without a Molbhav buyer account.
-- See docs/a2a.md.

-- Deals made over A2A have no Molbhav buyer; `source` says where the bargain came from.
ALTER TABLE bargains
  ALTER COLUMN buyer_id DROP NOT NULL,
  ADD COLUMN source text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'a2a'));

-- One outside agent's negotiation with one stall (task JSON + private state with floors).
CREATE TABLE a2a_tasks (
  id         text PRIMARY KEY,
  stall_id   text REFERENCES stalls (id),
  context_id text,
  task       jsonb NOT NULL,
  state      jsonb,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX a2a_tasks_expires ON a2a_tasks (expires_at);
CREATE INDEX a2a_tasks_context ON a2a_tasks (context_id, updated_at DESC);
