# eBay Bulk Lister 🚀

A mobile-first web application for automating Amazon to eBay product listings. Scan or enter Amazon ASINs, automatically scrape product data with images, manage inventory with advanced features, and export eBay-ready CSV files for bulk draft uploads.

## ✨ Features

- **📱 ASIN Scanner**: QR code/barcode scanner and manual entry for Amazon ASINs
- **🤖 Auto Scraping**: Automatically scrapes product details, pricing, and images from Amazon
- **🖼️ Image Management**: Downloads and stores product images in Supabase storage
- **📊 Product Management**: View, edit, filter, and organize products with status tracking
- **✅ Bulk Operations**: Select multiple products for status updates, export, or deletion
- **📥 eBay CSV Export**: Generate eBay-compliant draft CSV files ready for Seller Hub upload
- **🔄 Status Tracking**: Track products through lifecycle (INACTIVE → POSTED → SOLD)
- **💰 Smart Pricing**: Automatic eBay price calculation with configurable discount

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Scanner**: @yudiel/react-qr-scanner
- **Scraping**: Axios + Cheerio
- **Notifications**: Sonner (toast notifications)

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier works)
- Modern web browser with camera access (for scanning)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
cd bulklister
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once your project is ready, go to **Settings** → **API**
3. Copy your project URL and API keys

### 4. Configure Environment Variables

Copy the example environment file and add your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEFAULT_PRICE_DISCOUNT=0.25
DEFAULT_QUANTITY=1
```

### 5. Set Up Database

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `database/schema.sql`
4. Paste and run the SQL script to create tables, indexes, and storage bucket

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 Usage Workflow

### Adding Products

1. **Home Page**: Scan barcode/QR code or manually enter ASIN
2. **Auto-Scrape**: Product data is automatically fetched from Amazon
3. **Image Upload**: Product images are downloaded and stored in Supabase
4. **Product Created**: Product is saved with status INACTIVE

### Managing Products

1. **View All Products**: Navigate to `/products` to see all products
2. **Filter by Status**: Use tabs to filter by INACTIVE, POSTED, SOLD, or ALL
3. **Inline Editing**: Click "Edit" to modify title, price, or quantity
4. **Status Updates**: Change individual product status via dropdown or bulk update

### Exporting to eBay

1. **Select Products**: Check boxes next to products you want to export
2. **Export CSV**: Click "📥 Export CSV" button
3. **Upload to eBay**: 
   - Go to eBay Seller Hub
   - Navigate to **Listings** → **Drafts**
   - Upload the downloaded CSV file
   - Complete and publish your drafts

## 🗂️ Project Structure

```
bulklister/
├── app/
│   ├── api/
│   │   ├── products/
│   │   │   ├── route.ts              # GET, PATCH, DELETE products
│   │   │   └── bulk-update/
│   │   │       └── route.ts          # Bulk status updates
│   │   ├── export-csv/
│   │   │   └── route.ts              # CSV export endpoint
│   │   └── scrape-amazon/
│   │       └── route.ts              # Amazon scraping
│   ├── products/
│   │   └── page.tsx                  # All products page
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Home page (ASIN entry)
│   └── globals.css                   # Global styles
├── lib/
│   ├── types.ts                      # TypeScript interfaces
│   ├── logger.ts                     # Logging utility
│   ├── csv-generator.ts              # eBay CSV generator
│   └── supabase.ts                   # Supabase client
├── utils/
│   └── format.ts                     # Formatting utilities
├── database/
│   └── schema.sql                    # Database schema
├── .env.local.example                # Environment template
└── README.md                         # This file
```

## 📊 Database Schema

### `products` Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| asin | TEXT | Amazon ASIN (unique) |
| sku | TEXT | SKU format: AMZ-{ASIN} |
| title | TEXT | Product title |
| amazon_price | DECIMAL | Original Amazon price |
| ebay_price | DECIMAL | Calculated eBay price |
| quantity | INTEGER | Stock quantity |
| status | TEXT | INACTIVE, POSTED, or SOLD |
| created_at | TIMESTAMPTZ | Creation timestamp |
| exported_at | TIMESTAMPTZ | Last export timestamp |

### `product_images` Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_id | UUID | Foreign key to products |
| image_url | TEXT | Public URL from Supabase storage |
| storage_path | TEXT | Storage path in bucket |
| position | INTEGER | Image order (0-indexed) |

## 🔧 Configuration

### Price Discount

Default discount is 25% off Amazon price. Adjust in `.env.local`:

```bash
DEFAULT_PRICE_DISCOUNT=0.25  # 25% off
```

### Default Quantity

Set default product quantity:

```bash
DEFAULT_QUANTITY=1
```

## 📤 eBay CSV Format

The exported CSV follows the official eBay draft listings template format:

- **Info rows**: eBay template metadata
- **Header row**: Column definitions with eBay parameters
- **Data rows**: Product data formatted for eBay

**Key fields**:
- Action: `Draft`
- Custom label (SKU): `AMZ-{ASIN}`
- Title: Max 80 characters
- Price: Calculated eBay price
- Item photo URL: Pipe-separated image URLs (`url1|url2|url3`)
- Condition ID: `NEW`
- Description: HTML-formatted with bullets
- Format: `FixedPrice`

## 🚀 Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Add environment variables in Vercel dashboard
4. Deploy

```bash
# Or use Vercel CLI
npm i -g vercel
vercel --prod
```

### Environment Variables on Vercel

Add all variables from `.env.local` in your Vercel project settings:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DEFAULT_PRICE_DISCOUNT`
- `DEFAULT_QUANTITY`

## 🐛 Troubleshooting

### Camera Not Working

- Ensure HTTPS or localhost (camera requires secure context)
- Grant camera permissions in browser
- Try different browsers (Chrome/Safari recommended)

### Amazon Scraping Issues

- Amazon may block requests; consider adding delays or rotating user agents
- Some products may have different page structures
- Images might not load if Amazon changes their HTML structure

### Supabase Storage Issues

- Verify storage bucket is public
- Check storage policies are correctly set
- Ensure service role key has proper permissions

## 📝 License

MIT License - Feel free to use for personal or commercial projects.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## ⚠️ Disclaimer

This tool is for educational purposes. Always respect Amazon's and eBay's Terms of Service. Use responsibly and ensure you have rights to list products.

## 📞 Support

For issues or questions, please open an issue on GitHub.

---

Made with ❤️ for efficient eBay listing management

