-- Deals paid over x402 on Hedera (docs/x402.md): the settled transfer is the proof of payment.
-- Paid by "I've paid" (cash, UPI) leaves these NULL.
ALTER TABLE offers
  -- Hedera transaction id, e.g. 0.0.9185802@1755500000.000000000 (HashScan link)
  ADD COLUMN paid_tx text UNIQUE,
  -- Amount in the asset's smallest unit (USDC: 6 decimals) and the asset's token id
  ADD COLUMN paid_amount text,
  ADD COLUMN paid_asset text,
  -- The buyer's Hedera account that paid
  ADD COLUMN paid_by text;
