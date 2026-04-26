-- Add BLOCKED as a valid product status (run once in Supabase SQL Editor)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('INACTIVE', 'POSTED', 'SOLD', 'BLOCKED'));
