-- ONE-TIME migration: bring legacy part invoice photos (stored on
-- part_resources.invoice_photo_url before documents_archive existed) into
-- the unified archive so they show up in the Archive screen.
--
-- Run this ONCE manually in Supabase SQL Editor.
-- Safe to re-run: the NOT EXISTS guard prevents duplicates.

INSERT INTO documents_archive (
  user_id, vehicle_id, doc_type, linked_table, linked_id,
  photo_url, vendor_name, document_number, document_date, amount, currency,
  scanned_at, retention_until
)
SELECT
  user_id,
  vehicle_id,
  'part_invoice',
  'part_resources',
  id,
  invoice_photo_url,
  NULL,
  NULL,
  install_date,
  cost,
  'USD',
  created_at,
  (install_date + interval '3 years')::date
FROM part_resources
WHERE invoice_photo_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM documents_archive
    WHERE linked_table = 'part_resources' AND linked_id = part_resources.id
  );
