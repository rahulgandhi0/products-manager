import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { ApifyClient } from 'apify-client';
import { supabaseAdmin } from '@/lib/supabase';
import { AmazonProduct } from '@/lib/types';
import Logger from '@/lib/logger';

const logger = new Logger('API_SCRAPE_AMAZON');

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    
    // Support both old format (asin) and new format (identifier + identifierType)
    const identifier = body.identifier || body.asin;
    const identifierType = body.identifierType || 'ASIN';

    if (!identifier || typeof identifier !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid product identifier' },
        { status: 400 }
      );
    }

    logger.info('Processing product identifier', { identifier, identifierType });

    // Find ASIN based on identifier type
    let asin: string;
    
    if (identifierType === 'ASIN') {
      asin = identifier;
    } else {
      // For UPC, EAN, SKU, FNSKU: search Amazon to find the ASIN using Apify
      logger.info('Searching Amazon for product', { identifier, identifierType });
      const searchResult = await searchAmazonByIdentifier(identifier, identifierType);
      
      if (!searchResult) {
        logger.warn('Product not found on Amazon', { identifier, identifierType });
        return NextResponse.json(
          { success: false, error: `No product found on Amazon with ${identifierType}: ${identifier}` },
          { status: 404 }
        );
      }
      
      asin = searchResult;
      logger.info('Found ASIN from search', { identifier, identifierType, asin });
    }

    // Check if product already exists
    const { data: existingProduct } = await supabaseAdmin
      .from('products')
      .select('id, asin, title')
      .eq('asin', asin)
      .single();

    if (existingProduct) {
      logger.info('Product already exists', { asin, identifier, identifierType });
      return NextResponse.json({
        success: false,
        error: 'Product already exists',
        product: existingProduct,
      }, { status: 409 });
    }

    // Scrape Amazon product using Apify
    const amazonProduct = await scrapeAmazonProductWithApify(asin);

    // Calculate eBay price (25% discount by default)
    const discount = parseFloat(process.env.DEFAULT_PRICE_DISCOUNT || '0.25');
    const ebayPrice = amazonProduct.price 
      ? amazonProduct.price * (1 - discount) 
      : undefined;

    const quantity = parseInt(process.env.DEFAULT_QUANTITY || '1');

    // Insert product into database
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .insert({
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
      })
      .select()
      .single();

    if (productError) throw productError;

    // Download and upload images to Supabase storage
    const imageRecords = await uploadImagesToSupabase(
      product.id,
      amazonProduct.asin,
      amazonProduct.images
    );

    logger.info('Product created successfully', { 
      asin, 
      productId: product.id,
      imageCount: imageRecords.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        product,
        images: imageRecords,
      },
    });

  } catch (error: any) {
    logger.error('Failed to process product', error, { 
      message: error.message,
    });
    
    // Handle Apify-specific errors
    if (error.message?.includes('Apify')) {
      return NextResponse.json(
        { success: false, error: `Apify error: ${error.message}` },
        { status: 500 }
      );
    }
    
    // Handle timeout errors
    if (error.message?.includes('timeout') || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return NextResponse.json(
        { success: false, error: 'Request timed out. Please try again.' },
        { status: 408 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process Amazon product' },
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
      throw new Error('APIFY_API_TOKEN or APIFY_API_KEY is not configured');
    }

    const client = new ApifyClient({ token: apifyToken });
    
    // Search Amazon using the identifier
    const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(identifier)}`;
    
    logger.info('Searching Amazon via Apify', { identifier, identifierType, searchUrl });
    
    // Use junglee/amazon-crawler for product search
    const run = await client.actor('junglee/amazon-crawler').call({
      startUrls: [{ url: searchUrl }],
      maxItems: 1,
      country: 'US',
    });

    // Fetch results from the run's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    if (items.length === 0 || !items[0]) {
      logger.warn('No search results from Apify', { identifier, identifierType });
      return null;
    }

    // Extract ASIN from the result
    const result = items[0] as any;
    const asin = result.asin || result.ASIN;
    
    if (asin && typeof asin === 'string' && asin.length === 10) {
      logger.info('Found ASIN from Apify search', { identifier, identifierType, asin });
      return asin;
    }
    
    logger.warn('No valid ASIN found in Apify results', { identifier, identifierType });
    return null;
    
  } catch (error) {
    logger.error('Failed to search Amazon via Apify', error, { identifier, identifierType });
    return null;
  }
}

async function scrapeAmazonProductWithApify(asin: string): Promise<AmazonProduct> {
  const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
  if (!apifyToken) {
    throw new Error('APIFY_API_TOKEN or APIFY_API_KEY is not configured. Please add it to your .env file.');
  }

  const client = new ApifyClient({ token: apifyToken });
  const productUrl = `https://www.amazon.com/dp/${asin}`;

  logger.info('Scraping Amazon product via Apify', { asin, productUrl });

  try {
    // Run the Apify actor (junglee/amazon-crawler)
    const run = await client.actor('junglee/amazon-crawler').call({
      startUrls: [{ url: productUrl }],
      maxItems: 1,
      country: 'US',
      scrapeProductDetail: true,
    });

    // Fetch results from the run's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    if (items.length === 0 || !items[0]) {
      throw new Error(`No data returned from Apify for ASIN: ${asin}`);
    }

    const apifyResult = items[0] as any;
    
    logger.info('Apify scraping complete', { 
      asin, 
      hasTitle: !!apifyResult.title,
      hasPrice: !!apifyResult.price,
      imageCount: apifyResult.images?.length || 0,
    });

    // Parse price - handle different formats from Apify
    let price: number | undefined;
    if (apifyResult.price) {
      if (typeof apifyResult.price === 'number') {
        price = apifyResult.price;
      } else if (typeof apifyResult.price === 'string') {
        // Remove currency symbols and parse
        const priceStr = apifyResult.price.replace(/[^0-9.]/g, '');
        price = parseFloat(priceStr);
      } else if (apifyResult.price?.value !== undefined) {
        price = parseFloat(apifyResult.price.value);
      }
    }

    // Extract images - ensure we have an array of image URLs
    const images: string[] = [];
    if (Array.isArray(apifyResult.images)) {
      images.push(...apifyResult.images.filter((img: any) => typeof img === 'string'));
    } else if (apifyResult.images && typeof apifyResult.images === 'object') {
      // Sometimes images come as an object with URLs as keys
      images.push(...Object.keys(apifyResult.images));
    } else if (apifyResult.mainImage && typeof apifyResult.mainImage === 'string') {
      images.push(apifyResult.mainImage);
    } else if (apifyResult.thumbnailImage && typeof apifyResult.thumbnailImage === 'string') {
      images.push(apifyResult.thumbnailImage);
    }

    // Extract bullets/features
    const bullets: string[] = [];
    if (Array.isArray(apifyResult.features)) {
      bullets.push(...apifyResult.features.filter((b: any) => typeof b === 'string'));
    } else if (Array.isArray(apifyResult.bullets)) {
      bullets.push(...apifyResult.bullets.filter((b: any) => typeof b === 'string'));
    } else if (Array.isArray(apifyResult.featureBullets)) {
      bullets.push(...apifyResult.featureBullets.filter((b: any) => typeof b === 'string'));
    }

    // Parse dimensions if available
    let dimensions: AmazonProduct['dimensions'];
    if (apifyResult.dimensions) {
      const dim = apifyResult.dimensions;
      if (dim.length && dim.width && dim.height) {
        dimensions = {
          length: parseFloat(dim.length),
          width: parseFloat(dim.width),
          height: parseFloat(dim.height),
          unit: dim.unit?.toUpperCase() === 'CENTIMETER' ? 'CENTIMETER' : 'INCH',
        };
      }
    }

    // Parse weight if available
    let weight: AmazonProduct['weight'];
    if (apifyResult.weight) {
      const w = apifyResult.weight;
      if (w.value) {
        weight = {
          value: parseFloat(w.value),
          unit: w.unit?.toUpperCase() === 'KILOGRAM' ? 'KILOGRAM' : 'POUND',
        };
      }
    }

    const amazonProduct: AmazonProduct = {
      asin,
      title: apifyResult.title || apifyResult.productTitle || apifyResult.name || '',
      price,
      images,
      description: apifyResult.description || apifyResult.productDescription || '',
      bullets,
      brand: apifyResult.brand || apifyResult.manufacturer || apifyResult.brandName || undefined,
      upc: apifyResult.upc || apifyResult.ean || undefined,
      dimensions,
      weight,
    };

    logger.info('Mapped Apify result to AmazonProduct', { 
      asin, 
      title: amazonProduct.title.substring(0, 50),
      price: amazonProduct.price,
      imageCount: amazonProduct.images.length,
    });

    return amazonProduct;
    
  } catch (error: any) {
    logger.error('Failed to scrape via Apify', error, { asin });
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

