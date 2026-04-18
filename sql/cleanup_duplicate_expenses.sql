-- ONE-OFF audit script for duplicate expense / trip / service rows that may
-- have been inserted before duplicate detection was added to the AI scanners.
--
-- USAGE:
--   1. Run each SELECT below in Supabase SQL Editor to inspect what would be
--      flagged as a duplicate. The earliest row (created_at ASC) is kept;
--      rows where rn > 1 are the candidates for deletion.
--   2. Eyeball the output. Some "duplicates" are legitimate (two identical
--      fuel stops on the same day, etc).
--   3. Only after manual review, copy the matching DELETE FROM ... WHERE id IN (...)
--      and run it. This script does NOT delete anything automatically.

-- ===========================================================================
-- 1. vehicle_expenses (fuel, reefer, def, parts, tolls, etc.)
-- ===========================================================================
WITH ranked AS (
  SELECT
    id,
    user_id,
    vehicle_id,
    amount,
    date,
    description,
    category,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, amount, date, lower(trim(coalesce(description, '')))
      ORDER BY created_at ASC
    ) AS rn
  FROM vehicle_expenses
)
SELECT id, user_id, vehicle_id, date, amount, category, description, created_at, rn
FROM ranked
WHERE rn > 1
ORDER BY user_id, date DESC, amount DESC, created_at;

-- ===========================================================================
-- 2. byt_expenses (food, shower, laundry, personal)
-- ===========================================================================
WITH ranked AS (
  SELECT
    id,
    user_id,
    amount,
    date,
    name,
    category,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, amount, date, lower(trim(coalesce(name, '')))
      ORDER BY created_at ASC
    ) AS rn
  FROM byt_expenses
)
SELECT id, user_id, date, amount, category, name, created_at, rn
FROM ranked
WHERE rn > 1
ORDER BY user_id, date DESC, amount DESC, created_at;

-- ===========================================================================
-- 3. service_records (repair invoices: labor, parts, diagnostics, towing)
-- ===========================================================================
WITH ranked AS (
  SELECT
    id,
    user_id,
    vehicle_id,
    cost,
    date,
    description,
    category,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, cost, date, lower(trim(coalesce(description, '')))
      ORDER BY created_at ASC
    ) AS rn
  FROM service_records
)
SELECT id, user_id, vehicle_id, date, cost, category, description, created_at, rn
FROM ranked
WHERE rn > 1
ORDER BY user_id, date DESC, cost DESC, created_at;

-- ===========================================================================
-- 4. trips (rate confirmations / loads)
--    Trips have no date column — partition by route + distance + income, keeping
--    the earliest by created_at. A 24-hour tolerance is applied by truncating
--    created_at to the day, so two genuinely separate same-route loads on the
--    same day will still be flagged for review (legitimate cases get kept).
-- ===========================================================================
WITH ranked AS (
  SELECT
    id,
    user_id,
    vehicle_id,
    origin,
    destination,
    distance_km,
    income,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        user_id,
        lower(trim(coalesce(origin, ''))),
        lower(trim(coalesce(destination, ''))),
        round(coalesce(distance_km, 0)::numeric),
        round(coalesce(income, 0)::numeric, 2),
        date_trunc('day', created_at)
      ORDER BY created_at ASC
    ) AS rn
  FROM trips
)
SELECT id, user_id, vehicle_id, origin, destination, distance_km, income, created_at, rn
FROM ranked
WHERE rn > 1
ORDER BY user_id, created_at DESC;

-- ===========================================================================
-- HOW TO ACTUALLY DELETE (after manual review of the SELECTs above)
-- ===========================================================================
-- BEGIN;
-- DELETE FROM vehicle_expenses WHERE id IN (
--   '<paste ids from query 1>',
--   '<paste more ids>'
-- );
-- -- Repeat for byt_expenses / service_records / trips as needed.
-- -- Run SELECTs again to confirm rn>1 set is now empty, then COMMIT or ROLLBACK.
-- COMMIT;
