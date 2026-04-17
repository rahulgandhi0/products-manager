import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { ApifyClient } from 'apify-client';
import { supabaseAdmin } from '@/lib/supabase';
import { AmazonProduct } from '@/lib/types';
import Logger from '@/lib/logger';

export const maxDuration = 60; // seconds — needed for Apify actor runs on Vercel

const logger = new Logger('API_SCRAPE_AMAZON');

// Debug mode - set to true for verbose logging
const DEBUG_MODE = process.env.DEBUG_SCRAPER === 'true';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    logger.info('=== SCRAPE REQUEST STARTED ===', { timestamp: new Date().toISOString() });
    
    // Log environment variables (masked)
    logger.info('Environment check', {
      hasApifyToken: !!(process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY),
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      nodeEnv: process.env.NODE_ENV,
    });
    
    const body = await req.json();
    logger.info('Request body received', { body });
    
    // Support both old format (asin) and new format (identifier + identifierType)
    const identifier = body.identifier || body.asin;
    const identifierType = body.identifierType || 'ASIN';

    if (!identifier || typeof identifier !== 'string') {
      logger.warn('Invalid identifier provided', { identifier, identifierType });
      return NextResponse.json(
        { success: false, error: 'Invalid product identifier' },
        { status: 400 }
      );
    }

    logger.info('STEP 1: Processing product identifier', { identifier, identifierType });

    // Find ASIN based on identifier type
    let asin: string;
    
    if (identifierType === 'ASIN') {
      asin = identifier;
      logger.info('STEP 2: Using ASIN directly', { asin });
    } else {
      // For UPC, EAN, SKU, FNSKU: search Amazon to find the ASIN using Apify
      logger.info('STEP 2: Searching Amazon for product', { identifier, identifierType });
      const searchResult = await searchAmazonByIdentifier(identifier, identifierType);
      
      if (!searchResult) {
        logger.warn('Product not found on Amazon', { identifier, identifierType });
        return NextResponse.json(
          { success: false, error: `No product found on Amazon with ${identifierType}: ${identifier}` },
          { status: 404 }
        );
      }
      
      asin = searchResult;
      logger.info('STEP 2: Found ASIN from search', { identifier, identifierType, asin });
    }

    // Check if product already exists
    logger.info('STEP 3: Checking for existing product', { asin });
    const { data: existingProduct, error: checkError } = await supabaseAdmin
      .from('products')
      .select('id, asin, title')
      .eq('asin', asin)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      logger.error('Database check error', checkError, { asin });
      throw new Error(`Database error: ${checkError.message}`);
    }

    if (existingProduct) {
      logger.info('Product already exists', { asin, identifier, identifierType });
      return NextResponse.json({
        success: false,
        error: 'Product already exists',
        product: existingProduct,
      }, { status: 409 });
    }

    // Scrape Amazon product using Apify
    logger.info('STEP 4: Starting Apify scrape', { asin });
    const amazonProduct = await scrapeAmazonProductWithApify(asin);
    logger.info('STEP 4: Apify scrape completed', { 
      asin, 
      hasTitle: !!amazonProduct.title,
      hasPrice: !!amazonProduct.price,
      imageCount: amazonProduct.images.length 
    });

    // Calculate eBay price (25% discount by default)
    logger.info('STEP 5: Calculating prices', { amazonPrice: amazonProduct.price });
    const discount = parseFloat(process.env.DEFAULT_PRICE_DISCOUNT || '0.25');
    const ebayPrice = amazonProduct.price 
      ? amazonProduct.price * (1 - discount) 
      : undefined;

    const quantity = parseInt(process.env.DEFAULT_QUANTITY || '1');
    logger.info('Price calculation complete', { amazonPrice: amazonProduct.price, ebayPrice, discount, quantity });

    // Insert product into database
    logger.info('STEP 6: Inserting product into database', { asin });
    const productData = {
      asin: amazonProduct.asin,
      sku: `AMZ-${amazonProduct.asin}`,
      title: amazonProduct.title,
      description: amazonProduct.description,
      brand: amazonProduct.brand,
      upc: amazonProduct.upc,
      amazon_price: amazonProduct.price,
      ebay_price: ebayPrice,
      quantity: quantity,
      weight_value: amazonProduct.weight?.value,
      weight_unit: amazonProduct.weight?.unit,
      length: amazonProduct.dimensions?.length,
      width: amazonProduct.dimensions?.width,
      height: amazonProduct.dimensions?.height,
      dimension_unit: amazonProduct.dimensions?.unit,
      condition_id: 'NEW',
      format: 'FixedPrice',
      status: 'INACTIVE',
      raw_amazon_data: {
        bullets: amazonProduct.bullets,
        dimensions: amazonProduct.dimensions,
        weight: amazonProduct.weight,
      },
    };
    
    if (DEBUG_MODE) {
      logger.info('Product data to insert', { productData });
    }
    
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (productError) {
      logger.error('Database insert error', productError, { asin });
      throw new Error(`Database insert failed: ${productError.message}`);
    }
    
    logger.info('STEP 6: Product inserted successfully', { productId: product.id });

    // Download and upload images to Supabase storage
    logger.info('STEP 7: Starting image uploads', { imageCount: amazonProduct.images.length });
    const imageRecords = await uploadImagesToSupabase(
      product.id,
      amazonProduct.asin,
      amazonProduct.images
    );

    const elapsed = Date.now() - startTime;
    logger.info('=== SCRAPE REQUEST COMPLETED ===', { 
      asin, 
      productId: product.id,
      imageCount: imageRecords.length,
      elapsedMs: elapsed,
    });

    return NextResponse.json({
      success: true,
      data: {
        product,
        images: imageRecords,
      },
      debug: DEBUG_MODE ? { elapsedMs: elapsed } : undefined,
    });

  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    
    logger.error('=== SCRAPE REQUEST FAILED ===', error, { 
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      elapsedMs: elapsed,
    });
    
    // Build detailed error response
    const errorDetails: any = {
      success: false,
      error: error.message || 'Failed to process Amazon product',
    };
    
    // Add debug info in development
    if (DEBUG_MODE || process.env.NODE_ENV === 'development') {
      errorDetails.debug = {
        errorType: error.name,
        errorCode: error.code,
        stack: error.stack?.split('\n').slice(0, 5), // First 5 lines of stack
        elapsedMs: elapsed,
      };
    }
    
    // Handle Apify-specific errors
    if (error.message?.includes('Apify')) {
      logger.error('Apify error detected', { message: error.message });
      return NextResponse.json(
        { ...errorDetails, error: `Apify error: ${error.message}` },
        { status: 500 }
      );
    }
    
    // Handle timeout errors
    if (error.message?.includes('timeout') || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return NextResponse.json(
        { ...errorDetails, error: 'Request timed out. Please try again.' },
        { status: 408 }
      );
    }
    
    // Handle database errors
    if (error.message?.includes('Database')) {
      return NextResponse.json(
        { ...errorDetails, error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      errorDetails,
      { status: 500 }
    );
  }
}

async function searchAmazonByIdentifier(
  identifier: string, 
  identifierType: string
): Promise<string | null> {
  try {
    // Initialize Apify client
    const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
    if (!apifyToken) {
      logger.error('Apify token not configured');
      throw new Error('APIFY_API_TOKEN or APIFY_API_KEY is not configured');
    }

    logger.info('Initializing Apify client for search', { 
      tokenLength: apifyToken.length,
      tokenPrefix: apifyToken.substring(0, 10) + '...' 
    });
    
    const client = new ApifyClient({ token: apifyToken });
    
    // Search Amazon using the identifier
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(identifier)}`;
    
    logger.info('Calling Apify actor for search', { identifier, identifierType, searchUrl });
    
    // Use Axesso Amazon Product Scraper (7KgyOHHEiPEcilZXM)
    const run = await client.actor('7KgyOHHEiPEcilZXM').call({
      urls: [searchUrl],
    });

    logger.info('Apify search run completed', { runId: run.id, status: run.status });

    // Fetch results from the run's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    logger.info('Apify search results fetched', { itemCount: items.length });
    
    if (items.length === 0 || !items[0]) {
      logger.warn('No search results from Apify', { identifier, identifierType });
      return null;
    }

    if (DEBUG_MODE) {
      logger.info('Apify search result', { result: items[0] });
    }

    // Extract ASIN from the result
    const result = items[0] as any;
    const asin = result.asin || result.ASIN;
    
    if (asin && typeof asin === 'string' && asin.length === 10) {
      logger.info('Found ASIN from Apify search', { identifier, identifierType, asin });
      return asin;
    }
    
    logger.warn('No valid ASIN found in Apify results', { identifier, identifierType, result });
    return null;
    
  } catch (error: any) {
    logger.error('Failed to search Amazon via Apify', error, { 
      identifier, 
      identifierType,
      message: error.message,
      stack: error.stack,
    });
    return null;
  }
}

async function scrapeAmazonProductWithApify(asin: string): Promise<AmazonProduct> {
  const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
  if (!apifyToken) {
    logger.error('Apify token not configured');
    throw new Error('APIFY_API_TOKEN or APIFY_API_KEY is not configured. Please add it to your .env file.');
  }

  logger.info('Initializing Apify client for scraping', { 
    asin,
    tokenLength: apifyToken.length,
    tokenPrefix: apifyToken.substring(0, 10) + '...' 
  });

  const client = new ApifyClient({ token: apifyToken });
  const productUrl = `https://www.amazon.com/dp/${asin}`;

  logger.info('Starting Apify actor run', { asin, productUrl });

  try {
    // Run the Apify actor (Axesso Amazon Product Scraper: 7KgyOHHEiPEcilZXM)
    const runInput = {
      urls: [productUrl],
    };
    
    if (DEBUG_MODE) {
      logger.info('Apify actor input', { runInput });
    }
    
    const run = await client.actor('7KgyOHHEiPEcilZXM').call(runInput);
    logger.info('Apify actor run completed', { 
      runId: run.id, 
      status: run.status,
      datasetId: run.defaultDatasetId,
    });

    // Fetch results from the run's dataset
    logger.info('Fetching dataset items', { datasetId: run.defaultDatasetId });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    logger.info('Dataset items fetched', { itemCount: items.length });
    
    if (items.length === 0 || !items[0]) {
      logger.error('No data in Apify result', { asin, datasetId: run.defaultDatasetId });
      throw new Error(`No data returned from Apify for ASIN: ${asin}`);
    }

    const apifyResult = items[0] as any;
    
    if (DEBUG_MODE) {
      logger.info('Raw Apify result', { apifyResult });
    }
    
    logger.info('Apify scraping complete', { 
      asin, 
      statusCode: apifyResult.statusCode,
      statusMessage: apifyResult.statusMessage,
      hasTitle: !!apifyResult.title,
      hasPrice: !!apifyResult.price,
      imageCount: apifyResult.imageUrlList?.length || 0,
      resultKeys: Object.keys(apifyResult),
    });

    // Check if scraping was successful
    if (apifyResult.statusCode !== 200) {
      throw new Error(`Axesso scraper failed: ${apifyResult.statusMessage || 'Unknown error'}`);
    }

    // Parse price - Axesso returns price as number
    let price: number | undefined;
    if (apifyResult.price !== undefined && apifyResult.price !== null) {
      price = typeof apifyResult.price === 'number' ? apifyResult.price : parseFloat(apifyResult.price);
    } else if (apifyResult.retailPrice !== undefined && apifyResult.retailPrice !== null) {
      // Fallback to retailPrice if price is not available
      price = typeof apifyResult.retailPrice === 'number' ? apifyResult.retailPrice : parseFloat(apifyResult.retailPrice);
    }

    // Extract images - Axesso returns imageUrlList
    const images: string[] = [];
    if (Array.isArray(apifyResult.imageUrlList)) {
      images.push(...apifyResult.imageUrlList.filter((img: any) => typeof img === 'string' && img));
    }
    // Add main image if available and not already in list
    if (apifyResult.mainImage?.imageUrl && !images.includes(apifyResult.mainImage.imageUrl)) {
      images.unshift(apifyResult.mainImage.imageUrl);
    }

    // Extract bullets/features - Axesso returns features array
    const bullets: string[] = [];
    if (Array.isArray(apifyResult.features)) {
      bullets.push(...apifyResult.features.filter((b: any) => typeof b === 'string' && b));
    }

    // Extract brand - try multiple fields
    let brand: string | undefined;
    if (apifyResult.manufacturer) {
      // Manufacturer often includes "Visit the X Store" - extract just the brand name
      brand = apifyResult.manufacturer.replace(/^Visit the\s+/i, '').replace(/\s+Store$/i, '').trim();
    }
    // Try to find brand from productDetails
    if (!brand && Array.isArray(apifyResult.productDetails)) {
      const brandDetail = apifyResult.productDetails.find((d: any) => d.name === 'Brand');
      if (brandDetail?.value) {
        brand = brandDetail.value;
      }
    }

    // Extract UPC from productDetails if available
    let upc: string | undefined;
    if (Array.isArray(apifyResult.productDetails)) {
      const upcDetail = apifyResult.productDetails.find((d: any) => 
        d.name === 'UPC' || d.name === 'EAN' || d.name === 'Item model number'
      );
      if (upcDetail?.value) {
        upc = upcDetail.value;
      }
    }

    // Parse dimensions from productDetails if available
    let dimensions: AmazonProduct['dimensions'];
    if (Array.isArray(apifyResult.productDetails)) {
      const dimensionDetail = apifyResult.productDetails.find((d: any) => 
        d.name === 'Product Dimensions' || d.name === 'Item Dimensions'
      );
      if (dimensionDetail?.value) {
        // Try to parse dimensions like "10 x 5 x 3 inches"
        const match = dimensionDetail.value.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*(inch|cm)/i);
        if (match) {
          dimensions = {
            length: parseFloat(match[1]),
            width: parseFloat(match[2]),
            height: parseFloat(match[3]),
            unit: match[4].toLowerCase().startsWith('cm') ? 'CENTIMETER' : 'INCH',
          };
        }
      }
    }

    // Parse weight from productDetails if available
    let weight: AmazonProduct['weight'];
    if (Array.isArray(apifyResult.productDetails)) {
      const weightDetail = apifyResult.productDetails.find((d: any) => 
        d.name === 'Item Weight' || d.name === 'Shipping Weight'
      );
      if (weightDetail?.value) {
        // Try to parse weight like "2.5 pounds" or "1.2 kg"
        const match = weightDetail.value.match(/(\d+\.?\d*)\s*(pound|lb|kilogram|kg)/i);
        if (match) {
          weight = {
            value: parseFloat(match[1]),
            unit: match[2].toLowerCase().startsWith('k') ? 'KILOGRAM' : 'POUND',
          };
        }
      }
    }

    const amazonProduct: AmazonProduct = {
      asin: apifyResult.asin || asin,
      title: apifyResult.title || '',
      price,
      images,
      description: apifyResult.productDescription || '',
      bullets,
      brand,
      upc,
      dimensions,
      weight,
    };

    logger.info('Mapped Apify result to AmazonProduct', { 
      asin, 
      title: amazonProduct.title.substring(0, 50),
      price: amazonProduct.price,
      imageCount: amazonProduct.images.length,
    });

    if (DEBUG_MODE) {
      logger.info('Final AmazonProduct object', { amazonProduct });
    }

    return amazonProduct;
    
  } catch (error: any) {
    logger.error('Failed to scrape via Apify', error, { 
      asin,
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    throw new Error(`Apify scraping failed: ${error.message}`);
  }
}

async function uploadImagesToSupabase(
  productId: string,
  asin: string,
  imageUrls: string[]
): Promise<any[]> {
  const imageRecords = [];
  
  logger.info('Starting image upload', { 
    asin, 
    totalImages: imageUrls.length,
    willUpload: Math.min(imageUrls.length, 12)
  });

  for (let i = 0; i < Math.min(imageUrls.length, 12); i++) {
    try {
      const imageUrl = imageUrls[i];
      
      logger.debug(`Downloading image ${i + 1}`, { asin, imageUrl });
      
      // Download image from URL
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxRedirects: 3,
        validateStatus: (status) => status === 200,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': 'https://www.amazon.com/',
        },
      });

      const buffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const extension = contentType.split('/')[1] || 'jpg';

      // Upload to Supabase storage
      const storagePath = `${asin}/${i + 1}.${extension}`;
      logger.debug(`Uploading to Supabase`, { asin, storagePath, size: buffer.length });
      
      const { error: uploadError } = await supabaseAdmin
        .storage
        .from('product-images')
        .upload(storagePath, buffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        logger.error(`Upload error for image ${i + 1}`, uploadError, { asin, storagePath });
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabaseAdmin
        .storage
        .from('product-images')
        .getPublicUrl(storagePath);

      logger.debug(`Image uploaded successfully`, { asin, position: i, publicUrl });

      // Insert image record
      const { data: imageRecord, error: imageError } = await supabaseAdmin
        .from('product_images')
        .insert({
          product_id: productId,
          image_url: publicUrl,
          storage_path: storagePath,
          position: i,
        })
        .select()
        .single();

      if (imageError) {
        logger.error(`Database insert error for image ${i + 1}`, imageError, { asin });
        throw imageError;
      }

      imageRecords.push(imageRecord);
      logger.info(`Image ${i + 1} saved successfully`, { asin, position: i });

    } catch (error) {
      logger.error(`Failed to upload image ${i + 1}`, error, { 
        asin, 
        imageUrl: imageUrls[i],
        position: i 
      });
    }
  }

  logger.info('Image upload complete', { 
    asin, 
    totalAttempted: Math.min(imageUrls.length, 12),
    successful: imageRecords.length 
  });

  return imageRecords;
}

