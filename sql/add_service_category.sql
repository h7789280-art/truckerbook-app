-- Add category column to service_records table
ALTER TABLE service_records
ADD COLUMN IF NOT EXISTS category text DEFAULT 'repair';
