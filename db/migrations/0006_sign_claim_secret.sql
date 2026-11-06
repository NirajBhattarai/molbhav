-- Each stall sign proves it is the same chip with a random secret it made on first boot.
-- Only its SHA-256 is stored. Rows from before this migration adopt the first secret they see.

ALTER TABLE sign_claims ADD COLUMN secret_hash text;
