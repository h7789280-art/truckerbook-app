-- Восстановление колонок профильного онбординга для owner_operator
-- Обнаружено когда первый bypass-тестер (Николай) застрял на
-- онбординге с ошибкой "Could not find the 'brand' column of
-- 'profiles' in the schema cache"

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plate_number text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fuel_consumption numeric DEFAULT 34;
