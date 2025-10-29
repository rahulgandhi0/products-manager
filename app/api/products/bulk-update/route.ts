import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import Logger from '@/lib/logger';

const logger = new Logger('API_BULK_UPDATE');

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { ids, updates } = await req.json();

    logger.info('Bulk updating products', { ids, count: ids.length, updates });

    // Note: posted_at is automatically set by database trigger when status changes to POSTED
    const { error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .in('id', ids);

    if (error) throw error;

    if (updates.status === 'POSTED') {
      logger.info('Products marked as POSTED - posted_at will be set by trigger', { count: ids.length });
    } else if (updates.status && updates.status !== 'POSTED') {
      logger.info('Products status changed away from POSTED - posted_at will be cleared by trigger', { count: ids.length, newStatus: updates.status });
    }

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

