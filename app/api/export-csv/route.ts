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

    // Format: YYYY-MM-DD_[count]_drafts.csv
    const currentDate = new Date().toISOString().split('T')[0];
    const numberOfRows = products.length;
    const filename = `${currentDate}_${numberOfRows}_drafts.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
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

