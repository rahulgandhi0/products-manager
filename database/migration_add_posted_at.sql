-- =====================================================
-- MIGRATION: Add posted_at tracking
-- Run this on existing databases to add the posted_at column
-- =====================================================

-- Add posted_at column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

-- Add index for posted_at
CREATE INDEX IF NOT EXISTS idx_products_posted_at ON products(posted_at DESC);

-- Create trigger function to auto-update posted_at
CREATE OR REPLACE FUNCTION update_posted_at_column()
RETURNS TRIGGER AS $$
BEGIN
  -- Set posted_at when status changes to POSTED
  IF NEW.status = 'POSTED' AND (OLD.status IS NULL OR OLD.status != 'POSTED') THEN
    NEW.posted_at = NOW();
  END IF;
  
  -- Clear posted_at when status changes away from POSTED
  IF NEW.status != 'POSTED' AND OLD.status = 'POSTED' THEN
    NEW.posted_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS update_products_posted_at ON products;

CREATE TRIGGER update_products_posted_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_posted_at_column();

-- Optionally: Set posted_at for existing POSTED products to their updated_at time
-- Uncomment the line below if you want to backfill posted_at for existing POSTED products
-- UPDATE products SET posted_at = updated_at WHERE status = 'POSTED' AND posted_at IS NULL;

