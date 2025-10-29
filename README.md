# eBay Bulk Lister

A modern web application for automating Amazon-to-eBay product listings. Scan ASINs, automatically scrape product data with images, manage inventory, track posted listings, and export eBay-ready CSV files.

## Features

- **ASIN Scanner** - QR/barcode scanner and manual entry
- **Auto Scraping** - Fetch product details and images from Amazon  
- **Product Management** - View, edit, filter, and organize products
- **Status Tracking** - Track products (INACTIVE → POSTED → SOLD)
- **Aged Listings** - Automatically flag POSTED listings over 30 days old
- **One-Click Renewal** - Reset listing timer with Renew button
- **Bulk Operations** - Multi-select for status updates, export, or deletion
- **eBay CSV Export** - Generate eBay-compliant draft CSV files

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Get your API credentials from Settings → API
3. Run the database schema:
   - Go to SQL Editor in Supabase dashboard
   - Execute `database/schema.sql`
   - Run `database/migration_add_posted_at.sql` for existing databases

### 3. Configure Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEFAULT_PRICE_DISCOUNT=0.25
DEFAULT_QUANTITY=1
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Add Products** - Enter ASIN or scan barcode on home page
2. **Manage** - View and edit products at `/products`
3. **Filter** - Use tabs to filter by status (ALL, INACTIVE, POSTED, AGED, SOLD)
4. **Renew** - Click Renew button on aged listings to reset timer
5. **Export** - Select products and click "Export CSV"
6. **Upload to eBay** - Go to eBay Seller Hub → Upload CSV file

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   ├── products/         # Products management page
│   └── page.tsx          # Home page (ASIN entry)
├── lib/                  # Shared libraries
├── utils/                # Helper functions
├── database/             # SQL schema and migrations
└── docs/                 # Documentation
```

## Documentation

- [Setup Guide](docs/SETUP.md) - Detailed setup instructions
- [Posted Tracking](docs/POSTED_TRACKING.md) - How the 30-day expiration works
- [Architecture](docs/ARCHITECTURE.md) - System architecture details

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import repository on [vercel.com](https://vercel.com)
3. Add environment variables
4. Deploy

## License

MIT License - Feel free to use for personal or commercial projects.

## Disclaimer

This tool is for educational purposes. Always respect Amazon's and eBay's Terms of Service.
