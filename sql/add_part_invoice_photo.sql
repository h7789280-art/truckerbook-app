-- Adds invoice_photo_url column to part_resources so that AI-scanned or
-- manually uploaded parts invoices can be stored alongside the record.
-- Idempotent: safe to re-run.

ALTER TABLE part_resources
  ADD COLUMN IF NOT EXISTS invoice_photo_url text;
