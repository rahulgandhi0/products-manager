import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { supabaseAdmin } from '@/lib/supabase';
import { AmazonProduct } from '@/lib/types';
import Logger from '@/lib/logger';
import {
  checkRateLimit,
  recordRequest,
  recordError,
  getConsistentHeaders,
  getHumanDelay,
  addReadingDelay,
  getStats,
  addRequestJitter,
  addCacheBuster,
} from '@/lib/scraper-utils';

const logger = new Logger('API_SCRAPE_AMAZON');

export async function POST(req: NextRequest): Promise<NextResponse> {
  /**
   * DISCLAIMER: Web scraping Amazon violates their Terms of Service.
   * This implementation uses anti-detection measures but remains non-compliant.
   * Use at your own risk. Consider Amazon's Product Advertising API for compliance.
   */
  
  // Advanced rate limiting with human-like behavior
  const rateLimitCheck = checkRateLimit();
  
  if (!rateLimitCheck.allowed) {
    logger.warn('Rate limit check failed', rateLimitCheck);
    return NextResponse.json(
      { 
        success: false, 
        error: rateLimitCheck.reason || 'Rate limit exceeded',
        waitTime: rateLimitCheck.waitTime,
      },
      { status: 429 }
    );
  }
  
  // Add human-like delay before processing
  const delay = getHumanDelay();
  logger.debug('Adding human delay', { delay });
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Add small jitter to break timing patterns
  await addRequestJitter();
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
      // For UPC, EAN, SKU, FNSKU: search Amazon to find the ASIN
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

    // Scrape Amazon product page with human-like behavior
    const amazonProduct = await scrapeAmazonProduct(asin);
    
    // Record successful request
    recordRequest();

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
      stats: getStats(),
    });

    return NextResponse.json({
      success: true,
      data: {
        product,
        images: imageRecords,
      },
    });

  } catch (error: any) {
    // Record error for rate limiting
    const statusCode = error.response?.status;
    recordError(statusCode);
    
    logger.error('Failed to process product', error, { 
      statusCode,
      stats: getStats(),
    });
    
    // Handle specific error codes
    if (statusCode === 429 || statusCode === 503) {
      return NextResponse.json(
        { success: false, error: 'Amazon rate limit detected - please wait before trying again' },
        { status: 429 }
      );
    }
    
    if (statusCode === 404) {
      return NextResponse.json(
        { success: false, error: 'Product not found on Amazon' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to scrape Amazon product' },
      { status: 500 }
    );
  }
}

async function searchAmazonByIdentifier(
  identifier: string, 
  identifierType: string
): Promise<string | null> {
  try {
    // Search Amazon using the identifier - ONE TRY ONLY
    let searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(identifier)}`;
    
    // Add cache busters and natural-looking parameters
    searchUrl = addCacheBuster(searchUrl);
    
    logger.info('Searching Amazon with anti-detection', { identifier, identifierType });
    
    // Get consistent headers for this session
    const headers = getConsistentHeaders();
    
    const response = await axios.get(searchUrl, {
      headers,
      timeout: 10000,
      maxRedirects: 0,
      validateStatus: (status) => status === 200,
    });
    
    // Add "reading" delay to simulate human behavior
    await addReadingDelay();

    const $ = cheerio.load(response.data);
    
    // Try to find ASIN from search results
    // Method 1: From data-asin attribute in search results
    const firstResult = $('[data-asin]').first();
    let asin = firstResult.attr('data-asin');
    
    // Make sure it's a valid 10-character ASIN, not empty or "0000000000"
    if (asin && asin.length === 10 && asin !== '0000000000' && !asin.startsWith('0')) {
      logger.info('Found ASIN from search', { identifier, identifierType, asin });
      return asin;
    }
    
    // Method 2: Extract from product link
    const productLink = $('h2 a.a-link-normal').first().attr('href');
    if (productLink) {
      const asinMatch = productLink.match(/\/dp\/([A-Z0-9]{10})/);
      if (asinMatch) {
        asin = asinMatch[1];
        logger.info('Found ASIN from product link', { identifier, identifierType, asin });
        return asin;
      }
    }
    
    logger.warn('No valid ASIN found in search results', { identifier, identifierType });
    return null;
    
  } catch (error) {
    logger.error('Failed to search Amazon', error, { identifier, identifierType });
    return null;
  }
}

async function scrapeAmazonProduct(asin: string): Promise<AmazonProduct> {
  let url = `https://www.amazon.com/dp/${asin}`;
  
  // Add cache busters to URL
  url = addCacheBuster(url);

  logger.info('Scraping product page with enhanced anti-detection', { asin });

  // Get consistent headers that match current User-Agent
  const headers = getConsistentHeaders();

  const response = await axios.get(url, {
    headers,
    timeout: 10000,
    maxRedirects: 5,
    validateStatus: (status) => status === 200,
  });
  
  // Add "reading" delay to simulate human looking at page
  await addReadingDelay();

  const $ = cheerio.load(response.data);

  // Extract title
  const title = $('#productTitle').text().trim();

  // Extract price
  let price: number | undefined;
  const priceWhole = $('.a-price .a-price-whole').first().text().replace(/[^0-9]/g, '');
  const priceFraction = $('.a-price .a-price-fraction').first().text().replace(/[^0-9]/g, '');
  if (priceWhole) {
    price = parseFloat(`${priceWhole}.${priceFraction || '00'}`);
  }

  // Helper function to clean and normalize image URLs
  const cleanImageUrl = (url: string): string => {
    if (!url) return '';
    // Remove Amazon's size modifiers to get full resolution
    // Patterns: ._SL500_.jpg, ._AC_SX425_.jpg, etc.
    return url.replace(/\._[A-Z0-9_]+_\./, '.').replace(/\._[A-Z0-9_]+\.jpg/, '.jpg');
  };

  // Extract images - Gets ALL product images from Amazon (typically 5-7 images)
  const images: string[] = [];
  const imageSet = new Set<string>();

  // Method 1: Extract from imageBlock data attribute
  const imageBlockData = $('#imageBlock').attr('data-a-dynamic-image');
  if (imageBlockData) {
    try {
      const imageObj = JSON.parse(imageBlockData);
      Object.keys(imageObj).forEach(url => {
        const cleanUrl = cleanImageUrl(url);
        if (cleanUrl) imageSet.add(cleanUrl);
      });
      logger.debug('Extracted from imageBlock', { asin, count: imageSet.size });
    } catch (e) {
      logger.warn('Failed to parse imageBlock', { asin });
    }
  }

  // Method 2: Extract from thumbnail strip (altImages)
  $('#altImages img').each((_, img) => {
    const src = $(img).attr('src');
    if (src && !src.includes('play-icon')) {
      const cleanUrl = cleanImageUrl(src);
      if (cleanUrl) imageSet.add(cleanUrl);
    }
  });

  // Method 3: Look for colorImages in page scripts (high-res images)
  $('script:not([src])').each((_, el) => {
    const scriptContent = $(el).html() || '';
    
    // Try to find colorImages or imageGalleryData
    if (scriptContent.includes('colorImages') || scriptContent.includes('ImageBlockATF')) {
      // Extract hiRes images
      const hiResMatches = scriptContent.match(/"hiRes":"(https:\/\/[^"]+)"/g);
      if (hiResMatches) {
        hiResMatches.forEach(match => {
          const urlMatch = match.match(/"hiRes":"([^"]+)"/);
          if (urlMatch && urlMatch[1] !== 'null') {
            const cleanUrl = cleanImageUrl(urlMatch[1]);
            if (cleanUrl) imageSet.add(cleanUrl);
          }
        });
      }
      
      // Extract large images
      const largeMatches = scriptContent.match(/"large":"(https:\/\/[^"]+)"/g);
      if (largeMatches) {
        largeMatches.forEach(match => {
          const urlMatch = match.match(/"large":"([^"]+)"/);
          if (urlMatch && urlMatch[1] !== 'null') {
            const cleanUrl = cleanImageUrl(urlMatch[1]);
            if (cleanUrl) imageSet.add(cleanUrl);
          }
        });
      }
    }
  });

  // Method 4: Main product image as fallback
  if (imageSet.size === 0) {
    const mainImage = $('#landingImage').attr('src') || 
                     $('#imgBlkFront').attr('src') ||
                     $('img[data-old-hires]').attr('data-old-hires');
    if (mainImage) {
      const cleanUrl = cleanImageUrl(mainImage);
      if (cleanUrl) imageSet.add(cleanUrl);
    }
  }

  // Convert Set to Array (URLs are already cleaned and deduplicated)
  images.push(...Array.from(imageSet));

  logger.info('Image extraction complete', { 
    asin, 
    totalFound: images.length,
    methods: {
      imageBlock: imageBlockData ? 'found' : 'not found',
      thumbnails: $('#altImages img').length,
      scripts: 'searched'
    }
  });

  // Extract bullets
  const bullets: string[] = [];
  $('#feature-bullets ul li span.a-list-item').each((_, el) => {
    const text = $(el).text().trim();
    if (text) bullets.push(text);
  });

  // Extract brand
  const brand = $('#bylineInfo').text().replace(/^Brand:\s*/i, '').trim() ||
    $('tr.po-brand td.a-span9').text().trim();

  // Extract description
  const description = $('#productDescription p').text().trim() ||
    $('#feature-bullets').text().trim().substring(0, 500);

  // Extract UPC
  let upc: string | undefined;
  $('tr').each((_, el) => {
    const label = $(el).find('th').text().trim();
    if (label.includes('UPC') || label.includes('EAN')) {
      upc = $(el).find('td').text().trim();
    }
  });

  logger.info('Scraped Amazon product', { 
    asin, 
    title: title.substring(0, 50),
    price,
    imageCount: images.length,
    imageUrls: images 
  });

  return {
    asin,
    title,
    price,
    images,
    description,
    bullets,
    brand,
    upc,
  };
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
      
      // Download image - ONE TRY ONLY with consistent headers
      const headers = getConsistentHeaders();
      
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 8000,
        maxRedirects: 3,
        validateStatus: (status) => status === 200,
        headers: {
          'User-Agent': headers['User-Agent'],
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

