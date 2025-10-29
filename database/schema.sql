-- =====================================================
-- EBAY LISTING AUTOMATION - DATABASE SCHEMA
-- Supabase PostgreSQL Setup
-- =====================================================

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asin TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  upc TEXT,
  title TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  category_id TEXT,
  amazon_price DECIMAL(10, 2),
  ebay_price DECIMAL(10, 2),
  quantity INTEGER DEFAULT 1,
  weight_value DECIMAL(10, 2),
  weight_unit TEXT,
  length DECIMAL(10, 2),
  width DECIMAL(10, 2),
  height DECIMAL(10, 2),
  dimension_unit TEXT,
  condition_id TEXT DEFAULT 'NEW',
  format TEXT DEFAULT 'FixedPrice',
  status TEXT NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('INACTIVE', 'POSTED', 'SOLD')),
  raw_amazon_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  exported_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ
);

-- Indexes for products table
CREATE INDEX IF NOT EXISTS idx_products_asin ON products(asin);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_posted_at ON products(posted_at DESC);

-- ============================================
-- PRODUCT IMAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for product_images table
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_position ON product_images(product_id, position);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Auto-update posted_at timestamp when status changes to POSTED
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

CREATE TRIGGER update_products_posted_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_posted_at_column();

-- ============================================
-- STORAGE BUCKET
-- ============================================

-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public Access" ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated Delete" ON storage.objects FOR DELETE
USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- For development, you can disable RLS or set permissive policies
-- In production, configure proper RLS policies based on your auth setup

-- Disable RLS for now (enable and configure for production)
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_images DISABLE ROW LEVEL SECURITY;

-- Example RLS policies (commented out, uncomment and adjust for production):
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable read access for all users" ON products FOR SELECT USING (true);
-- CREATE POLICY "Enable insert for authenticated users only" ON products FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "Enable update for authenticated users only" ON products FOR UPDATE USING (auth.role() = 'authenticated');
-- CREATE POLICY "Enable delete for authenticated users only" ON products FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Uncomment to insert sample data:
-- INSERT INTO products (asin, sku, title, amazon_price, ebay_price, quantity, status)
-- VALUES 
--   ('B09XYZ1234', 'AMZ-B09XYZ1234', 'Sample Product 1', 39.99, 29.99, 1, 'INACTIVE'),
--   ('B08ABC5678', 'AMZ-B08ABC5678', 'Sample Product 2', 59.99, 44.99, 2, 'INACTIVE');

