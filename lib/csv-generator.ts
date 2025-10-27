import { Product, ProductImage } from './types';
import Logger from './logger';

const logger = new Logger('CSV_GENERATOR');

export function generateEbayDraftCsv(products: Product[], images: ProductImage[]): string {
  logger.info('Generating eBay draft CSV', { productCount: products.length });

  // eBay template info rows - EXACT format from official eBay template
  const infoRows = [
    '#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,',
    '#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,',
    '"#INFO After you\'ve successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",,,,,,,,,,',
    '#INFO,,,,,,,,,,'
  ];

  // Header row - EXACT format from official eBay template
  const header = 'Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,Title,UPC,Price,Quantity,Item photo URL,Condition ID,Description,Format';

  // Data rows
  const dataRows = products.map((product) => {
    const productImages = images
      .filter(img => img.product_id === product.id)
      .sort((a, b) => a.position - b.position);

    // Join image URLs with pipe separator (eBay supports multiple images)
    const imageUrls = productImages.map(img => img.image_url).join('|');

    // Build HTML description
    const description = buildHtmlDescription(product);

    // Category ID: Default to 175837 (Other Consumer Electronics)
    // User can edit this in the app or update in eBay after upload
    const categoryId = product.category_id || '175837';

    // SKU: Use ASIN as SKU for tracking
    const sku = product.asin || '';

    // UPC: Leave empty (eBay template shows empty UPC is valid)
    const upc = product.upc || '';

    // Build row matching eBay template format exactly
    const row = [
      'Draft',
      sku ? escapeCsvField(sku) : '',
      categoryId,
      escapeCsvField(product.title.substring(0, 80)),
      upc,
      product.ebay_price?.toFixed(2) || '9.99',
      product.quantity.toString(),
      imageUrls, // Don't escape - URLs with pipes should not be quoted
      'NEW',
      escapeCsvField(description),
      'FixedPrice'
    ];

    return row.join(',');
  });

  const csv = [...infoRows, header, ...dataRows].join('\n');

  logger.info('CSV generation complete', { 
    productCount: products.length,
    csvLength: csv.length,
    sampleRow: dataRows[0]?.substring(0, 100) 
  });

  return csv;
}

function buildHtmlDescription(product: Product): string {
  const parts: string[] = [];

  // Build clean HTML description similar to eBay template format
  parts.push('<p>');
  
  if (product.brand) {
    parts.push(`<strong>Brand:</strong> ${escapeHtml(product.brand)}<br>`);
  }

  parts.push('</p>');

  // Add bullet points if available
  if (product.raw_amazon_data?.bullets && Array.isArray(product.raw_amazon_data.bullets)) {
    parts.push('<p><strong>Key Features:</strong></p>');
    parts.push('<ul>');
    (product.raw_amazon_data.bullets as string[]).slice(0, 8).forEach(bullet => {
      const cleaned = escapeHtml(bullet.trim());
      if (cleaned) {
        parts.push(`<li>${cleaned}</li>`);
      }
    });
    parts.push('</ul>');
  }

  // Add description if available
  if (product.description) {
    const cleanedDesc = escapeHtml(product.description.substring(0, 500));
    if (cleanedDesc) {
      parts.push(`<p>${cleanedDesc}</p>`);
    }
  }

  // Add condition and shipping info
  parts.push('<p><strong>Condition:</strong> Brand New, Factory Sealed</p>');
  parts.push('<p><strong>Shipping:</strong> Fast and secure shipping</p>');

  return parts.join('');
}

function escapeCsvField(field: string): string {
  if (!field) return '';

  // Always wrap fields with commas, quotes, or newlines in quotes
  // NOTE: Don't wrap if it only contains pipes (for image URLs)
  const needsQuotes = field.includes(',') || field.includes('"') || field.includes('\n');
  
  if (needsQuotes) {
    // Escape internal quotes by doubling them
    return `"${field.replace(/"/g, '""')}"`;
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

