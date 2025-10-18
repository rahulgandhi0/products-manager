import { Product, ProductImage } from './types';
import Logger from './logger';

const logger = new Logger('CSV_GENERATOR');

export function generateEbayDraftCsv(products: Product[], images: ProductImage[]): string {
  logger.info('Generating eBay draft CSV', { productCount: products.length });

  // eBay template info rows - EXACT format required by eBay
  const infoRows = [
    '#INFO,Version=0.0.2,Template= eBay-draft-listings-template_US,,,,,,,,',
    '#INFO Action and Category ID are required fields. 1) Set Action to Draft 2) Please find the category ID for your listings here: https://pages.ebay.com/sellerinformation/news/categorychanges.html,,,,,,,,,,',
    '"#INFO After you\'ve successfully uploaded your draft from the Seller Hub Reports tab, complete your drafts to active listings here: https://www.ebay.com/sh/lst/drafts",,,,,,,,,,',
    '#INFO,,,,,,,,,,'
  ];

  // Header row - EXACT format required by eBay
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

    // Match eBay template exactly
    // Condition: Use "NEW" string (as shown in official template)
    const conditionId = 'NEW';

    // Category ID: Use provided or default to 11450 (Everything Else > Other)
    // User can update category in eBay after upload
    const categoryId = product.category_id || '11450';

    // SKU: Leave empty if not set (eBay template shows empty SKU is valid)
    const sku = product.sku || '';

    // UPC: Leave empty if not set (eBay template shows empty UPC is valid)
    const upc = product.upc || '';

    return [
      'Draft',
      sku,
      categoryId,
      escapeCsvField(product.title.substring(0, 80)),
      upc,
      product.ebay_price?.toFixed(2) || '9.99',
      product.quantity.toString(),
      imageUrls,
      conditionId,
      escapeCsvField(description),
      'FixedPrice'
    ].join(',');
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

  // Simple, clean HTML description
  parts.push(`<div>`);
  
  if (product.brand) {
    parts.push(`<p><strong>Brand:</strong> ${escapeHtml(product.brand)}</p>`);
  }

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
    parts.push(`<p>${escapeHtml(product.description.substring(0, 500))}</p>`);
  }

  // Add condition statement
  parts.push('<p><strong>Condition:</strong> Brand New, Factory Sealed</p>');
  parts.push('<p><strong>Shipping:</strong> Fast and Secure Shipping</p>');
  
  parts.push(`</div>`);

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

