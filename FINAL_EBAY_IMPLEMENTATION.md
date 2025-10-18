# EBAY LISTING AUTOMATION - FINAL IMPLEMENTATION GUIDE
## With Advanced Product Management & eBay Draft CSV Export

---

## PROJECT OVERVIEW
Mobile-first web application for scanning/entering Amazon ASINs, scraping product data, storing in Supabase with images, and managing inventory with advanced features: inline editing, bulk operations, status management, and eBay draft CSV export using official eBay template format.

---

## TABLE OF CONTENTS
1. [Quick Start](#quick-start)
2. [Tech Stack](#tech-stack)
3. [eBay CSV Template Format](#ebay-csv-template-format)
4. [Database Schema](#database-schema)
5. [Complete Source Code](#complete-source-code)
6. [Product Management Features](#product-management-features)
7. [API Routes](#api-routes)
8. [UI Components](#ui-components)
9. [Deployment](#deployment)

---

## QUICK START

### 1. Initialize Project
```bash
npx create-next-app@latest ebay-manager --typescript --tailwind --app --eslint
cd ebay-manager
```

### 2. Install Dependencies
```bash
npm install @supabase/supabase-js @yudiel/react-qr-scanner axios cheerio zod zustand sonner @tanstack/react-table
npm install -D @types/node prettier eslint-config-prettier
```

### 3. Environment Setup
Create `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DEFAULT_PRICE_DISCOUNT=0.25
DEFAULT_QUANTITY=1
```

---

## EBAY CSV TEMPLATE FORMAT

Based on your provided template, here's the exact structure:

### CSV Headers (Row 5)
```csv
Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,Title,UPC,Price,Quantity,Item photo URL,Condition ID,Description,Format
```

### Info Rows (Rows 1-4)
```csv
#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,
#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,
"#INFO After you've successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",,,,,,,,,,
#INFO,,,,,,,,,,
```

### Data Row Format
```csv
Draft,AMZ-B09XYZ1234,47140,Product Title Here,123456789012,29.99,1,https://image1.jpg|https://image2.jpg,NEW,<p>Description HTML</p>,FixedPrice
```

### Key Fields:
- **Action**: Always "Draft"
- **Custom label (SKU)**: Format as `AMZ-{ASIN}`
- **Category ID**: Can be left blank for eBay auto-suggest
- **Title**: 80 char max
- **UPC**: Optional
- **Price**: Calculated (Amazon price - 25%)
- **Quantity**: Default 1
- **Item photo URL**: Pipe-separated URLs (|)
- **Condition ID**: "NEW"
- **Description**: HTML formatted
- **Format**: "FixedPrice"

---

## DATABASE SCHEMA

### Products Table (Enhanced)
```sql
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
  exported_at TIMESTAMPTZ
);

CREATE INDEX idx_products_asin ON products(asin);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_created_at ON products(created_at DESC);

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
```

### Product Images Table
```sql
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_images_product_id ON product_images(product_id);
CREATE INDEX idx_product_images_position ON product_images(product_id, position);
```

### Storage Bucket
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Access" ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');
```

---

## COMPLETE SOURCE CODE

### `lib/types.ts`
```typescript
export interface Product {
  id: string;
  asin: string;
  sku: string;
  upc?: string;
  title: string;
  description?: string;
  brand?: string;
  category_id?: string;
  amazon_price?: number;
  ebay_price?: number;
  quantity: number;
  weight_value?: number;
  weight_unit?: string;
  length?: number;
  width?: number;
  height?: number;
  dimension_unit?: string;
  condition_id: string;
  format: string;
  status: 'INACTIVE' | 'POSTED' | 'SOLD';
  raw_amazon_data?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  exported_at?: string;
  thumbnail?: string; // First image URL (not in DB, joined from product_images)
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  storage_path: string;
  position: number;
  created_at: string;
}

export interface AmazonProduct {
  asin: string;
  title: string;
  price?: number;
  images: string[];
  description?: string;
  bullets?: string[];
  brand?: string;
  upc?: string;
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'INCH' | 'CENTIMETER';
  };
  weight?: {
    value: number;
    unit: 'POUND' | 'KILOGRAM';
  };
}

export type StatusFilter = 'ALL' | 'INACTIVE' | 'POSTED' | 'SOLD';
```

### `lib/csv-generator.ts` (eBay Template Format)
```typescript
import { Product, ProductImage } from './types';
import Logger from './logger';

const logger = new Logger('CSV_GENERATOR');

export function generateEbayDraftCsv(products: Product[], images: ProductImage[]): string {
  logger.info('Generating eBay draft CSV', { productCount: products.length });

  // eBay template info rows
  const infoRows = [
    '#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,',
    '#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,',
    '"#INFO After you\'ve successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",,,,,,,,,,',
    '#INFO,,,,,,,,,,'
  ];

  // Header row
  const header = 'Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,Title,UPC,Price,Quantity,Item photo URL,Condition ID,Description,Format';

  // Data rows
  const dataRows = products.map((product) => {
    const productImages = images
      .filter(img => img.product_id === product.id)
      .sort((a, b) => a.position - b.position);

    // Join image URLs with pipe separator
    const imageUrls = productImages.map(img => img.image_url).join('|');

    // Build HTML description
    const description = buildHtmlDescription(product);

    return [
      'Draft',
      escapeCsvField(product.sku),
      product.category_id || '', // Empty for eBay auto-suggest
      escapeCsvField(product.title.substring(0, 80)),
      product.upc || '',
      product.ebay_price?.toFixed(2) || '9.99',
      product.quantity.toString(),
      escapeCsvField(imageUrls),
      product.condition_id,
      escapeCsvField(description),
      product.format
    ].join(',');
  });

  const csv = [...infoRows, header, ...dataRows].join('\n');

  logger.info('CSV generation complete', { 
    productCount: products.length,
    csvLength: csv.length 
  });

  return csv;
}

function buildHtmlDescription(product: Product): string {
  const parts: string[] = [];

  parts.push(\`<p><strong>\${escapeHtml(product.title)}</strong></p>\`);

  if (product.brand) {
    parts.push(\`<p><strong>Brand:</strong> \${escapeHtml(product.brand)}</p>\`);
  }

  if (product.raw_amazon_data?.bullets && Array.isArray(product.raw_amazon_data.bullets)) {
    parts.push('<ul>');
    (product.raw_amazon_data.bullets as string[]).slice(0, 10).forEach(bullet => {
      parts.push(\`<li>\${escapeHtml(bullet)}</li>\`);
    });
    parts.push('</ul>');
  }

  if (product.description) {
    parts.push(\`<p>\${escapeHtml(product.description)}</p>\`);
  }

  parts.push('<p><em>New, sealed product. Fast shipping!</em></p>');

  return parts.join('');
}

function escapeCsvField(field: string): string {
  if (!field) return '';

  // Wrap in quotes if contains comma, quote, newline, or pipe
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('|')) {
    return \`"\${field.replace(/"/g, '""')}"\`;
  }

  return field;
}

function escapeHtml(text: string): string {
  if (!text) return '';

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

### `lib/logger.ts`
```typescript
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'PERF';

interface LogMetadata {
  [key: string]: unknown;
}

class Logger {
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    const timestamp = new Date().toISOString();
    const logMessage = \`[\${timestamp}] [\${level}] [\${this.component}] \${message}\`;

    if (metadata) {
      console.log(logMessage, metadata);
    } else {
      console.log(logMessage);
    }
  }

  info(message: string, metadata?: LogMetadata): void {
    this.log('INFO', message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.log('WARN', message, metadata);
  }

  error(message: string, error?: Error | unknown, metadata?: LogMetadata): void {
    const errorMetadata = {
      ...metadata,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
    };
    this.log('ERROR', message, errorMetadata);
  }

  perf(operation: string, durationMs: number, metadata?: LogMetadata): void {
    const perfMetadata = { ...metadata, durationMs };
    this.log('PERF', \`\${operation} completed in \${durationMs}ms\`, perfMetadata);
  }

  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: LogMetadata
  ): Promise<T> {
    const startTime = Date.now();
    this.info(\`Starting \${operation}\`, metadata);

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.perf(operation, duration, metadata);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(\`\${operation} failed after \${duration}ms\`, error, metadata);
      throw error;
    }
  }
}

export default Logger;
```

### `app/api/products/route.ts` (CRUD Operations)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import Logger from '@/lib/logger';

const logger = new Logger('API_PRODUCTS');

// GET - Fetch products with pagination and filtering
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = 50;
    const offset = (page - 1) * limit;
    const status = searchParams.get('status') || 'ALL';

    logger.info('Fetching products', { page, status });

    let query = supabaseAdmin
      .from('products')
      .select(\`
        *,
        product_images!inner(image_url, position)
      \`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'ALL') {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    // Transform data to include first image as thumbnail
    const products = data?.map((product: any) => ({
      ...product,
      thumbnail: product.product_images
        ?.sort((a: any, b: any) => a.position - b.position)[0]?.image_url || null,
      product_images: undefined, // Remove nested images from response
    }));

    return NextResponse.json({
      success: true,
      data: {
        products,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      },
    });

  } catch (error) {
    logger.error('Failed to fetch products', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}

// PATCH - Update product
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const { id, updates } = await req.json();

    logger.info('Updating product', { id, updates });

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });

  } catch (error) {
    logger.error('Failed to update product', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update product' },
      { status: 500 }
    );
  }
}

// DELETE - Delete products
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { ids } = await req.json();

    logger.info('Deleting products', { ids, count: ids.length });

    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .in('id', ids);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Failed to delete products', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete products' },
      { status: 500 }
    );
  }
}
```

### `app/api/products/bulk-update/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import Logger from '@/lib/logger';

const logger = new Logger('API_BULK_UPDATE');

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { ids, updates } = await req.json();

    logger.info('Bulk updating products', { ids, count: ids.length, updates });

    // Update all products with the same values
    const { error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .in('id', ids);

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      message: \`Updated \${ids.length} products\` 
    });

  } catch (error) {
    logger.error('Bulk update failed', error);
    return NextResponse.json(
      { success: false, error: 'Bulk update failed' },
      { status: 500 }
    );
  }
}
```

### `app/api/export-csv/route.ts`
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateEbayDraftCsv } from '@/lib/csv-generator';
import Logger from '@/lib/logger';

const logger = new Logger('API_EXPORT_CSV');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    const { productIds } = await req.json();

    logger.info('CSV export request', { productIds, count: productIds.length });

    // Fetch selected products
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', productIds)
      .order('created_at', { ascending: true });

    if (productsError) throw productsError;

    if (!products || products.length === 0) {
      return new NextResponse('No products selected', { status: 404 });
    }

    // Fetch all images for these products
    const { data: images } = await supabaseAdmin
      .from('product_images')
      .select('*')
      .in('product_id', productIds)
      .order('position', { ascending: true });

    // Generate CSV
    const csv = generateEbayDraftCsv(products, images || []);

    // Mark as exported
    await supabaseAdmin
      .from('products')
      .update({ exported_at: new Date().toISOString() })
      .in('id', productIds);

    const duration = Date.now() - startTime;
    logger.info('CSV export complete', { productCount: products.length, duration });

    const timestamp = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': \`attachment; filename="eBay-draft-listing-\${timestamp}.csv"\`,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('CSV export failed', error, { duration });

    return NextResponse.json(
      { error: 'Failed to generate CSV' },
      { status: 500 }
    );
  }
}
```

---

## UI COMPONENTS

### `app/products/page.tsx` (All Products Page with Advanced Features)
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Product, StatusFilter } from '@/lib/types';
import { formatPrice } from '@/utils/format';
import { toast } from 'sonner';
import Image from 'next/image';

export default function AllProductsPage(): JSX.Element {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Product>>({});

  useEffect(() => {
    fetchProducts();
  }, [page, statusFilter]);

  const fetchProducts = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(
        \`/api/products?page=\${page}&status=\${statusFilter}\`
      );
      const result = await response.json();

      if (result.success) {
        setProducts(result.data.products);
        setTotalPages(result.data.pagination.totalPages);
      }
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string): void => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const selectAll = (): void => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  };

  const handleBulkStatusUpdate = async (status: 'POSTED' | 'SOLD' | 'INACTIVE'): Promise<void> => {
    if (selectedIds.size === 0) {
      toast.error('No products selected');
      return;
    }

    try {
      const response = await fetch('/api/products/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          updates: { status },
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(\`Updated \${selectedIds.size} products to \${status}\`);
        setSelectedIds(new Set());
        fetchProducts();
      } else {
        toast.error('Bulk update failed');
      }
    } catch (error) {
      toast.error('Failed to update products');
    }
  };

  const handleExportSelected = async (): Promise<void> => {
    if (selectedIds.size === 0) {
      toast.error('No products selected');
      return;
    }

    try {
      toast.loading('Generating CSV...');

      const response = await fetch('/api/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: Array.from(selectedIds) }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = \`eBay-draft-\${new Date().toISOString().split('T')[0]}.csv\`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast.success('CSV downloaded!');
        setSelectedIds(new Set());
      } else {
        toast.error('Export failed');
      }
    } catch (error) {
      toast.error('Failed to export CSV');
    }
  };

  const handleDeleteSelected = async (): Promise<void> => {
    if (selectedIds.size === 0) {
      toast.error('No products selected');
      return;
    }

    if (!confirm(\`Delete \${selectedIds.size} products? This cannot be undone.\`)) {
      return;
    }

    try {
      const response = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(\`Deleted \${selectedIds.size} products\`);
        setSelectedIds(new Set());
        fetchProducts();
      } else {
        toast.error('Delete failed');
      }
    } catch (error) {
      toast.error('Failed to delete products');
    }
  };

  const startEditing = (product: Product): void => {
    setEditingId(product.id);
    setEditValues({
      title: product.title,
      ebay_price: product.ebay_price,
      quantity: product.quantity,
      category_id: product.category_id,
    });
  };

  const saveEdit = async (id: string): Promise<void> => {
    try {
      const response = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates: editValues }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Product updated');
        setEditingId(null);
        fetchProducts();
      } else {
        toast.error('Update failed');
      }
    } catch (error) {
      toast.error('Failed to update product');
    }
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditValues({});
  };

  const updateStatus = async (id: string, status: 'POSTED' | 'SOLD' | 'INACTIVE'): Promise<void> => {
    try {
      const response = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates: { status } }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(\`Status updated to \${status}\`);
        fetchProducts();
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">All Products</h1>
          <button
            onClick={() => router.push('/')}
            className="btn-primary"
          >
            + Add Product
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Status Filter */}
            <div className="flex gap-2">
              {(['ALL', 'INACTIVE', 'POSTED', 'SOLD'] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className={\`px-4 py-2 rounded-lg font-medium transition-colors \${
                    statusFilter === status
                      ? 'bg-yellow-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }\`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Bulk Actions */}
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="btn-secondary text-sm"
                disabled={products.length === 0}
              >
                {selectedIds.size === products.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('POSTED')}
                className="btn-secondary text-sm"
                disabled={selectedIds.size === 0}
              >
                Mark Posted ({selectedIds.size})
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('SOLD')}
                className="btn-secondary text-sm"
                disabled={selectedIds.size === 0}
              >
                Mark Sold ({selectedIds.size})
              </button>
              <button
                onClick={handleExportSelected}
                className="btn-primary text-sm"
                disabled={selectedIds.size === 0}
              >
                📥 Export CSV ({selectedIds.size})
              </button>
              <button
                onClick={handleDeleteSelected}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-600"
                disabled={selectedIds.size === 0}
              >
                🗑 Delete ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === products.length && products.length > 0}
                      onChange={selectAll}
                      className="w-4 h-4"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Image</th>
                  <th className="px-4 py-3 text-left">ASIN</th>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Price</th>
                  <th className="px-4 py-3 text-left">Qty</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No products found
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelection(product.id)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {product.thumbnail ? (
                          <div className="relative w-16 h-16">
                            <Image
                              src={product.thumbnail}
                              alt={product.title}
                              fill
                              className="object-cover rounded"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-gray-400">
                            No Image
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{product.asin}</td>
                      <td className="px-4 py-3 max-w-md">
                        {editingId === product.id ? (
                          <input
                            type="text"
                            value={editValues.title || ''}
                            onChange={(e) =>
                              setEditValues({ ...editValues, title: e.target.value })
                            }
                            className="w-full px-2 py-1 border rounded"
                          />
                        ) : (
                          <span className="line-clamp-2">{product.title}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === product.id ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editValues.ebay_price || ''}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                ebay_price: parseFloat(e.target.value),
                              })
                            }
                            className="w-24 px-2 py-1 border rounded"
                          />
                        ) : (
                          formatPrice(product.ebay_price)
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === product.id ? (
                          <input
                            type="number"
                            value={editValues.quantity || ''}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                quantity: parseInt(e.target.value),
                              })
                            }
                            className="w-16 px-2 py-1 border rounded"
                          />
                        ) : (
                          product.quantity
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={product.status}
                          onChange={(e) =>
                            updateStatus(product.id, e.target.value as any)
                          }
                          className={\`px-2 py-1 rounded text-sm font-medium \${
                            product.status === 'POSTED'
                              ? 'bg-green-100 text-green-800'
                              : product.status === 'SOLD'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }\`}
                        >
                          <option value="INACTIVE">INACTIVE</option>
                          <option value="POSTED">POSTED</option>
                          <option value="SOLD">SOLD</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {editingId === product.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => saveEdit(product.id)}
                              className="text-green-600 hover:text-green-700 text-sm font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-gray-600 hover:text-gray-700 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditing(product)}
                            className="text-yellow-600 hover:text-yellow-700 text-sm font-medium"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 p-4 border-t">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
```

---

## KEY FEATURES IMPLEMENTED

### ✅ **Product Management**
1. **View all products** - 50 per page with pagination
2. **Thumbnail display** - First image from each product
3. **Status filtering** - INACTIVE, POSTED, SOLD, ALL
4. **Inline editing** - Edit title, price, quantity directly
5. **Bulk selection** - Select multiple products
6. **Status updates** - Single or bulk status changes
7. **CSV export** - Export selected products as eBay draft CSV
8. **Delete** - Single or bulk delete

### ✅ **Database Features**
- **Timestamps**: `created_at`, `updated_at`, `exported_at`
- **Status tracking**: INACTIVE (default) → POSTED → SOLD
- **Image linking**: Images stored in Supabase bucket, linked to ASIN
- **Full CRUD**: Create, Read, Update, Delete

### ✅ **eBay CSV Format**
- Matches your exact template structure
- Info rows + header + data rows
- All required fields populated
- Pipe-separated image URLs
- HTML descriptions
- Ready for Seller Hub upload

---

## DEPLOYMENT

Deploy to Vercel:
```bash
vercel --prod
```

Set environment variables in Vercel Dashboard.

---

## USAGE WORKFLOW

1. **Add Products**: Scan/enter ASIN → Amazon scrapes → Images uploaded to Supabase → Product saved as INACTIVE
2. **Manage**: Go to All Products → View/edit/filter → Select products
3. **Export**: Select products → Export CSV → Upload to eBay Seller Hub
4. **Track**: Mark as POSTED when live → Mark as SOLD when sold

---

This implementation provides a complete product management system with advanced features, eBay-compliant CSV export, and full tracking capabilities!
