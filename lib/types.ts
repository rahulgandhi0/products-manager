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
  posted_at?: string;
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

export type StatusFilter = 'ALL' | 'INACTIVE' | 'POSTED' | 'SOLD' | 'AGED';

