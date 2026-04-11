-- Add filing_status column to estimated_tax_settings
-- Values: 'single', 'married_jointly', 'head_of_household'
ALTER TABLE estimated_tax_settings ADD COLUMN IF NOT EXISTS filing_status TEXT DEFAULT 'single';
