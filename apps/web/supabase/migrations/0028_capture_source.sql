-- Capture provenance: which device created the capture and whether it was
-- spoken or typed. source_device denormalizes the paired-device token's NAME
-- (not its id) so the record survives token revocation/deletion; browser
-- captures store 'Web'. source_input is 'voice' | 'text'. Nullable — legacy
-- rows predate tracking.

ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS source_device text,
  ADD COLUMN IF NOT EXISTS source_input text;
