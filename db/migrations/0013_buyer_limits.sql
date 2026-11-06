-- Buyer spending limits and "agree / pay for me". Null per_order / per_day = no cap.
-- auto_agree / auto_order on a bargain are snapshotted at create so Profile edits don't rewrite old ones.
-- bargains.auto is what the agent decided (src/lib/server/auto-order.ts). Day window: midnight Asia/Kolkata.

CREATE TABLE buyer_limits (
  user_id    text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  per_order  integer CHECK (per_order > 0),
  per_day    integer CHECK (per_day > 0),
  auto_agree boolean NOT NULL DEFAULT false,
  auto_order boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bargains ADD COLUMN auto_agree boolean NOT NULL DEFAULT false;
ALTER TABLE bargains ADD COLUMN auto_order boolean NOT NULL DEFAULT false;
ALTER TABLE bargains ADD COLUMN auto jsonb;
