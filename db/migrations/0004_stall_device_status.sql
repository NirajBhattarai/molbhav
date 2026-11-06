-- Stall sign button state (open / closed / paused), kept in sync via /api/stall/device/*.
-- is_open stays the buyer-facing flag: true only when device_status = 'open'.

ALTER TABLE stalls
  ADD COLUMN device_status text NOT NULL DEFAULT 'closed'
    CHECK (device_status IN ('open', 'closed', 'paused')),
  ADD COLUMN pause_until timestamptz;

UPDATE stalls SET device_status = CASE WHEN is_open THEN 'open' ELSE 'closed' END;
