-- Cleanup corrupt shift rows with insane odometer_end values.
-- Any real truck mileage is well below 2,000,000; values above that
-- are OCR glitches, accidental concatenations, or deltas written as absolutes.
-- These rows were poisoning fetchLatestOdometer fallback before the
-- priority fix (profiles -> shifts -> fuel_entries).

DELETE FROM shifts
WHERE user_id = '1efc9ded-4280-4434-9715-614ad29724e6'
  AND odometer_end >= 2000000;
