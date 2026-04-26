-- Add BLOCKED as a valid product status (run ONCE per database)
--
-- In Supabase: Dashboard → SQL Editor → New query → paste this file → Run
--
-- If DROP CONSTRAINT errors, list check names with:
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.products'::regclass AND contype = 'c';
-- Then replace products_status_check below with the actual name.

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('INACTIVE', 'POSTED', 'SOLD', 'BLOCKED'));
