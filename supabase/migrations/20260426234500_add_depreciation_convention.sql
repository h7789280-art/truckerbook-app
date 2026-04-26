-- Pack 2 — MACRS edge cases: persist the IRS depreciation convention per asset.
--
-- Mid-quarter convention is determined ANNUALLY at the time of purchase via the
-- IRS 40%-Q4 trigger (Treas. Reg. §1.168(d)-1): if more than 40% of total basis
-- of property placed in service during the tax year is placed in service in Q4
-- (Oct-Dec), the mid-quarter convention applies to ALL assets placed in service
-- that year. Once decided, the choice is locked at the asset level for the
-- entire recovery period and is NOT re-evaluated in later years.
--
-- We store the chosen convention so future-year deductions stay consistent with
-- the year-of-purchase election even after additional assets are added.
--
-- Half-year is the default (it is what the existing rows assume); back-filling
-- via the DEFAULT keeps legacy rows compatible without a data migration.

ALTER TABLE vehicle_depreciation
ADD COLUMN IF NOT EXISTS depreciation_convention text
  CHECK (depreciation_convention IN (
    'half_year',
    'mid_quarter_q1',
    'mid_quarter_q2',
    'mid_quarter_q3',
    'mid_quarter_q4'
  ))
  DEFAULT 'half_year';

COMMENT ON COLUMN vehicle_depreciation.depreciation_convention IS
  'IRS depreciation convention applied in the year the asset was placed in service. Half-year is the default; mid-quarter is set when the 40%-Q4 trigger fires for that year. Locked at the asset level once decided.';
