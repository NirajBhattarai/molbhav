-- Buyer bargains: one want, many stall offers, chat turns per offer.

CREATE TABLE bargains (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   text NOT NULL REFERENCES users (id),
  want       text NOT NULL,
  title      text NOT NULL,
  budget     integer CHECK (budget IS NULL OR budget > 0),
  buyer_lang text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bargains_buyer_created ON bargains (buyer_id, created_at DESC);

CREATE TABLE offers (
  bargain_id uuid NOT NULL REFERENCES bargains (id) ON DELETE CASCADE,
  stall_id   text NOT NULL REFERENCES stalls (id),
  item_id    integer NOT NULL REFERENCES stall_items (id),
  status     text NOT NULL
               CHECK (status IN ('haggling', 'declined', 'agreed', 'paid')),
  asked      integer CHECK (asked IS NULL OR asked > 0),
  current    integer CHECK (current IS NULL OR current > 0),
  agent_offer integer CHECK (agent_offer IS NULL OR agent_offer > 0),
  version    integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bargain_id, stall_id)
);

CREATE INDEX offers_stall_updated ON offers (stall_id, updated_at DESC);

CREATE TABLE turns (
  id         bigserial PRIMARY KEY,
  bargain_id uuid NOT NULL,
  stall_id   text NOT NULL,
  speaker    text NOT NULL CHECK (speaker IN ('agent', 'stall', 'buyer')),
  msg        text,
  vars       jsonb,
  text       text,
  status     text NOT NULL,
  current    integer,
  at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (bargain_id, stall_id) REFERENCES offers (bargain_id, stall_id) ON DELETE CASCADE
);

CREATE INDEX turns_offer_at ON turns (bargain_id, stall_id, at);
