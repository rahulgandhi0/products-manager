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
      message: `Updated ${ids.length} products` 
    });

  } catch (error) {
    logger.error('Bulk update failed', error);
    return NextResponse.json(
      { success: false, error: 'Bulk update failed' },
      { status: 500 }
    );
  }
}

