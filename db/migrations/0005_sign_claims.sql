-- Stall-sign onboarding: chip shows a short code; shopkeeper claims it in the app.
CREATE TABLE sign_claims (
  chip_id     text PRIMARY KEY,                 -- e.g. a1b2c3d4e5f6 (MAC hex)
  claim_code  text NOT NULL,                    -- 6 digits while waiting
  stall_id    text REFERENCES stalls (id) ON DELETE SET NULL,
  agent_id    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  claimed_at  timestamptz
);

CREATE UNIQUE INDEX sign_claims_live_code ON sign_claims (claim_code)
  WHERE claimed_at IS NULL;
