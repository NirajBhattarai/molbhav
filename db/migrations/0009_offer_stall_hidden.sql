-- Shop can clear ended bargains from their list without deleting the buyer's copy.
ALTER TABLE offers
  ADD COLUMN stall_hidden boolean NOT NULL DEFAULT false;
