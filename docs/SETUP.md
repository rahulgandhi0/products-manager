# Setup Guide 🔧

Complete step-by-step setup instructions for the eBay Bulk Lister application.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [Local Development Setup](#local-development-setup)
4. [Database Configuration](#database-configuration)
5. [Testing](#testing)
6. [Deployment](#deployment)

---

## Prerequisites

### Required Software

- **Node.js**: v18.0.0 or higher
  ```bash
  node --version  # Should be 18+
  ```

- **npm**: v9.0.0 or higher
  ```bash
  npm --version
  ```

- **Git**: For version control
  ```bash
  git --version
  ```

### Accounts Needed

- [Supabase](https://supabase.com) account (free tier is sufficient)
- [Vercel](https://vercel.com) account for deployment (optional)

---

## Supabase Setup

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click **"New Project"**
3. Fill in project details:
   - **Name**: `ebay-lister` (or your choice)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to your location
4. Click **"Create new project"**
5. Wait 2-3 minutes for project initialization

### Step 2: Get API Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: Starts with `eyJhbGc...`
   - **service_role key**: Starts with `eyJhbGc...` (keep this secret!)

### Step 3: Set Up Database

1. In Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Open `database/schema.sql` from this project
4. Copy the entire contents and paste into the SQL Editor
5. Click **"Run"** or press `Ctrl/Cmd + Enter`
6. Verify success: Check for green "Success" message

### Step 4: Verify Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. You should see a bucket named `product-images`
3. Click on it and verify it's set to **Public**
4. If not created, the SQL script should have created it

### Step 5: Configure Storage Policies

Storage policies should be automatically created by the SQL script. Verify:

1. Go to **Storage** → `product-images` → **Policies**
2. You should see:
   - **Public Access**: Allow SELECT for all
   - **Authenticated Upload**: Allow INSERT for authenticated users
   - **Authenticated Delete**: Allow DELETE for authenticated users

---

## Local Development Setup

### Step 1: Clone and Install

```bash
cd bulklister
npm install
```

### Step 2: Configure Environment

1. Copy the example environment file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` with your values:
   ```bash
   # From Supabase Settings → API
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   
   # Pricing Configuration
   DEFAULT_PRICE_DISCOUNT=0.25  # 25% discount on Amazon price
   DEFAULT_QUANTITY=1           # Default product quantity
   ```

### Step 3: Start Development Server

```bash
npm run dev
```

The app should now be running at [http://localhost:3000](http://localhost:3000)

---

## Database Configuration

### Understanding the Schema

**Products Table** (`products`):
- Stores all product information
- SKU format: `AMZ-{ASIN}`
- Status field: `INACTIVE` (default), `POSTED`, `SOLD`
- Prices stored in USD as DECIMAL(10, 2)

**Product Images Table** (`product_images`):
- Links to products via `product_id`
- Stores both Supabase public URL and storage path
- Position field for image ordering (0-indexed)

**Storage Bucket** (`product-images`):
- Public bucket for product images
- Path structure: `{ASIN}/{position}.{extension}`
- Example: `B09XYZ1234/0.jpg`, `B09XYZ1234/1.jpg`

### Modifying the Schema

If you need to make changes:

1. Go to **SQL Editor** in Supabase
2. Run migration commands:
   ```sql
   -- Example: Add new column
   ALTER TABLE products ADD COLUMN notes TEXT;
   
   -- Example: Create index
   CREATE INDEX idx_products_notes ON products(notes);
   ```

3. Update TypeScript types in `lib/types.ts`

### Backing Up Data

```sql
-- Export all products
SELECT * FROM products;

-- Export with images
SELECT 
  p.*,
  json_agg(pi.*) as images
FROM products p
LEFT JOIN product_images pi ON pi.product_id = p.id
GROUP BY p.id;
```

---

## Testing

### Test ASIN Entry

1. Go to `http://localhost:3000`
2. Enter a test ASIN: `B08N5WRWNW` (Amazon Kindle example)
3. Click **"Add Product"**
4. Watch for:
   - Success toast notification
   - Redirect to `/products`
   - Product appears in table with images

### Test Product Management

1. Go to `/products`
2. Test filtering: Click status filter buttons
3. Test selection: Check boxes next to products
4. Test inline editing: Click "Edit" on a product
5. Test status update: Change dropdown status
6. Test bulk operations: Select multiple and update status

### Test CSV Export

1. Select one or more products
2. Click **"📥 Export CSV"**
3. Verify CSV file downloads
4. Open CSV in spreadsheet software
5. Check format matches eBay template:
   - 4 info rows
   - 1 header row
   - Data rows with product information

---

## Deployment

### Deploy to Vercel

#### Option 1: Vercel Dashboard

1. Push code to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

5. Add environment variables:
   - Click **"Environment Variables"**
   - Add each variable from `.env.local`
   - Add to all environments (Production, Preview, Development)

6. Click **"Deploy"**
7. Wait for deployment to complete
8. Visit your production URL

#### Option 2: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Environment Variables on Vercel

Add these in Vercel Dashboard → Settings → Environment Variables:

| Variable | Type | Required |
|----------|------|----------|
| NEXT_PUBLIC_SUPABASE_URL | Plain Text | Yes |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Plain Text | Yes |
| SUPABASE_SERVICE_ROLE_KEY | Secret | Yes |
| DEFAULT_PRICE_DISCOUNT | Plain Text | No (default: 0.25) |
| DEFAULT_QUANTITY | Plain Text | No (default: 1) |

### Post-Deployment Checklist

- [ ] Environment variables are set
- [ ] Application loads without errors
- [ ] Can add products via ASIN
- [ ] Images upload successfully
- [ ] Can view products page
- [ ] Can export CSV
- [ ] Camera scanner works (HTTPS required)

---

## Troubleshooting

### Common Issues

**Issue**: Supabase connection errors
- **Solution**: Verify environment variables are correct
- Check Supabase project status (dashboard)
- Verify API keys haven't been rotated

**Issue**: Images not uploading
- **Solution**: Check storage bucket exists and is public
- Verify storage policies are correctly set
- Check service role key has storage permissions

**Issue**: Amazon scraping fails
- **Solution**: Amazon may have changed page structure
- Check console for specific errors
- Try different ASINs to isolate issue
- Consider adding delays or user agent rotation

**Issue**: Camera not working in production
- **Solution**: Ensure site is served over HTTPS
- Camera API requires secure context
- Check browser permissions

**Issue**: Build fails on Vercel
- **Solution**: Verify all dependencies are in `package.json`
- Check TypeScript errors locally: `npm run build`
- Review build logs for specific errors

### Getting Help

1. Check [GitHub Issues](https://github.com/yourusername/bulklister/issues)
2. Review application logs in Vercel dashboard
3. Check Supabase logs: **Database** → **Logs**
4. Open a new issue with:
   - Error message
   - Steps to reproduce
   - Environment (local/production)

---

## Next Steps

After successful setup:

1. **Customize Pricing**: Adjust `DEFAULT_PRICE_DISCOUNT` in `.env.local`
2. **Test with Real Data**: Add 5-10 products to test workflow
3. **eBay Integration**: Upload generated CSV to eBay Seller Hub
4. **Monitoring**: Set up error tracking (e.g., Sentry)
5. **Backups**: Configure Supabase automated backups

---

Need help? Open an issue on GitHub!

