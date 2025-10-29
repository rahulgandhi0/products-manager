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
      .select(`
        *,
        product_images!inner(image_url, position)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status === 'EXPIRED') {
      // Products that are POSTED and posted_at is more than 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query = query
        .eq('status', 'POSTED')
        .not('posted_at', 'is', null)
        .lt('posted_at', thirtyDaysAgo.toISOString());
    } else if (status !== 'ALL') {
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

    // Note: posted_at is automatically set by database trigger when status changes to POSTED
    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (updates.status === 'POSTED') {
      logger.info('Product marked as POSTED - posted_at will be set by trigger', { id });
    } else if (updates.status && updates.status !== 'POSTED') {
      logger.info('Product status changed away from POSTED - posted_at will be cleared by trigger', { id, newStatus: updates.status });
    }

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

    // First, get all image storage paths for these products
    const { data: images, error: imagesError } = await supabaseAdmin
      .from('product_images')
      .select('storage_path, product_id')
      .in('product_id', ids);

    if (imagesError) {
      logger.error('Failed to fetch image paths', imagesError);
    }

    // Delete images from storage bucket
    if (images && images.length > 0) {
      logger.info('Deleting images from storage', { imageCount: images.length });
      
      const storagePaths = images.map(img => img.storage_path);
      const { data: deletedFiles, error: storageError } = await supabaseAdmin
        .storage
        .from('product-images')
        .remove(storagePaths);

      if (storageError) {
        logger.error('Failed to delete some images from storage', storageError, {
          paths: storagePaths
        });
      } else {
        logger.info('Deleted images from storage', { 
          deletedCount: deletedFiles?.length || 0 
        });
      }
    }

    // Delete products (this will cascade delete image records from database)
    const { error: deleteError } = await supabaseAdmin
      .from('products')
      .delete()
      .in('id', ids);

    if (deleteError) throw deleteError;

    logger.info('Products deleted successfully', { 
      productCount: ids.length,
      imageCount: images?.length || 0 
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Failed to delete products', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete products' },
      { status: 500 }
    );
  }
}

