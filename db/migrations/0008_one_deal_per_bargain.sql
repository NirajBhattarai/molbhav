-- A bargain ends in at most one deal: a second Agree on another stall fails instead of
-- leaving the buyer with two agreed (or paid) offers.
CREATE UNIQUE INDEX offers_one_deal ON offers (bargain_id)
  WHERE status IN ('agreed', 'paid');
