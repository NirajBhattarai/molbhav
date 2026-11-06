-- ENS names for stall agents (ENSv2, Sepolia): <ens_label>.<ENS_PARENT>, e.g. mohd-soyeb-khan.molbhav.eth.
-- See docs/ens.md. Written step by step, so a run that stops halfway picks up where it left off:
--   ens_status  NULL → 'resolver' (its own resolver is deployed) → 'registered' (subname exists)
--               → 'live' (owner's edit rights granted, records current)
ALTER TABLE stalls
  ADD COLUMN ens_label text UNIQUE,
  ADD COLUMN ens_resolver text,
  ADD COLUMN ens_status text CHECK (ens_status IN ('resolver', 'registered', 'live')),
  -- Fingerprint of the records last written (recordsKey), to skip writes that change nothing.
  ADD COLUMN ens_records text;
