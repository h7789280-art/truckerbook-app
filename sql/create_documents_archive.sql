-- Unified archive for ALL scanned documents (receipts, part invoices, trip rate
-- confirmations, BOLs). Every AI-scanned photo is registered here with metadata
-- and a link back to the business record it populated.
-- Required for IRS compliance: owner-operators must keep supporting documents
-- for 3–7 years.

CREATE TABLE IF NOT EXISTS documents_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,

  -- Type and links
  doc_type text NOT NULL,
  -- doc_type values:
  --   'receipt_fuel', 'receipt_def', 'receipt_hotel', 'receipt_food',
  --   'receipt_other', 'part_invoice', 'trip_rateconf', 'trip_bol', 'other'
  linked_table text,
  -- linked_table values: 'vehicle_expenses', 'byt_expenses', 'trips',
  --   'part_resources', 'service_records', 'fuel_entries'
  linked_id uuid,

  -- Metadata
  photo_url text NOT NULL,
  thumbnail_url text,
  vendor_name text,
  document_number text,
  document_date date,
  amount numeric(12,2),
  currency text DEFAULT 'USD',

  -- Search helpers
  ocr_raw_text text,
  tags text[],

  -- Housekeeping
  scanned_at timestamptz DEFAULT now(),
  retention_until date,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docs_user_date ON documents_archive(user_id, document_date DESC);
CREATE INDEX IF NOT EXISTS idx_docs_user_type ON documents_archive(user_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_docs_linked ON documents_archive(linked_table, linked_id);
CREATE INDEX IF NOT EXISTS idx_docs_ocr ON documents_archive USING gin(to_tsvector('simple', coalesce(ocr_raw_text, '')));

ALTER TABLE documents_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_see_own_docs" ON documents_archive;
CREATE POLICY "users_see_own_docs" ON documents_archive
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_docs" ON documents_archive;
CREATE POLICY "users_insert_own_docs" ON documents_archive
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_docs" ON documents_archive;
CREATE POLICY "users_update_own_docs" ON documents_archive
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_docs" ON documents_archive;
CREATE POLICY "users_delete_own_docs" ON documents_archive
  FOR DELETE USING (auth.uid() = user_id);
