# Quick Reference Guide 🚀

Essential commands and information for working with the eBay Bulk Lister.

---

## 📦 NPM Commands

### Development
```bash
npm run dev              # Start development server (http://localhost:3000)
npm run build            # Build production bundle
npm run start            # Start production server
npm run lint             # Run ESLint
```

### Package Management
```bash
npm install              # Install all dependencies
npm install <package>    # Install new package
npm update               # Update packages
npm outdated             # Check for outdated packages
```

---

## 🗂️ File Locations

### Configuration Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `next.config.js` - Next.js configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `.env.local` - Environment variables (not in git)

### Application Code
- `app/page.tsx` - Home page (ASIN entry)
- `app/products/page.tsx` - Product management page
- `app/api/` - All API routes
- `lib/` - Shared libraries and utilities
- `utils/` - Helper functions

### Documentation
- `README.md` - Project overview
- `SETUP.md` - Setup instructions
- `PROJECT_SUMMARY.md` - Complete implementation summary
- `QUICK_REFERENCE.md` - This file

---

## 🔑 Environment Variables

Copy to `.env.local`:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Optional (with defaults)
DEFAULT_PRICE_DISCOUNT=0.25    # 25% discount
DEFAULT_QUANTITY=1              # Default quantity
```

Get from: Supabase Dashboard → Settings → API

---

## 🗄️ Database Quick Reference

### Tables
- `products` - Main product data
- `product_images` - Product images with URLs

### Storage
- Bucket: `product-images`
- Path format: `{ASIN}/{position}.{ext}`
- Example: `B09XYZ1234/0.jpg`

### Useful SQL Queries

**Count products by status:**
```sql
SELECT status, COUNT(*) 
FROM products 
GROUP BY status;
```

**Recent products:**
```sql
SELECT * 
FROM products 
ORDER BY created_at DESC 
LIMIT 10;
```

**Products without images:**
```sql
SELECT p.* 
FROM products p
LEFT JOIN product_images pi ON p.id = pi.product_id
WHERE pi.id IS NULL;
```

**Clear all products:**
```sql
TRUNCATE products CASCADE;
```

---

## 🎯 Common Tasks

### Add a Test Product
1. Go to home page
2. Enter ASIN: `B08N5WRWNW`
3. Click "Add Product"
4. Check `/products` page

### Export Products to CSV
1. Go to `/products`
2. Select products (checkboxes)
3. Click "📥 Export CSV"
4. File downloads automatically

### Update Product Status
**Individual:**
- Use dropdown in product row

**Bulk:**
1. Select products
2. Click "Mark Posted" or "Mark Sold"

### Delete Products
**Individual:**
1. Edit product
2. Can implement delete button

**Bulk:**
1. Select products
2. Click "🗑 Delete"
3. Confirm

---

## 🐛 Debugging

### Check Logs

**Browser Console:**
```javascript
// Open DevTools (F12)
// Check Console tab for errors
```

**Server Logs:**
```bash
# Terminal where npm run dev is running
# All API logs appear here
```

**Supabase Logs:**
```
Supabase Dashboard → Logs
- Database logs
- Storage logs
- API logs
```

### Common Errors

**"Supabase connection failed"**
- Check `.env.local` values
- Verify Supabase project is active
- Check API keys are correct

**"Failed to upload images"**
- Verify storage bucket exists
- Check storage policies
- Ensure bucket is public

**"Amazon scraping failed"**
- Try different ASIN
- Check network connection
- Review console for specific error

---

## 🎨 Styling Quick Reference

### Tailwind Classes

**Buttons:**
```tsx
className="btn-primary"    // Yellow button
className="btn-secondary"  // Gray button
```

**Cards:**
```tsx
className="card"           // White card with shadow
```

**Badges:**
```tsx
className="badge badge-inactive"  // Gray badge
className="badge badge-posted"    // Green badge
className="badge badge-sold"      // Blue badge
```

### Custom Colors
- Primary: `yellow-500` (#EAB308)
- Background: `gray-50`
- Text: `gray-900`
- Success: `green-500`
- Error: `red-500`

---

## 📡 API Endpoints

### Products
```
GET    /api/products?page=1&status=ALL
PATCH  /api/products (body: {id, updates})
DELETE /api/products (body: {ids: []})
```

### Bulk Operations
```
POST   /api/products/bulk-update (body: {ids: [], updates: {}})
```

### Export
```
POST   /api/export-csv (body: {productIds: []})
```

### Scraping
```
POST   /api/scrape-amazon (body: {asin: 'B09XYZ1234'})
```

---

## 🚀 Deployment Commands

### Vercel CLI
```bash
npm i -g vercel          # Install Vercel CLI
vercel login             # Login to Vercel
vercel                   # Deploy preview
vercel --prod            # Deploy to production
```

### Git
```bash
git add .
git commit -m "Your message"
git push origin main
```

---

## 📊 Status Values

```
INACTIVE → POSTED → SOLD
```

- **INACTIVE**: Default status for new products
- **POSTED**: Product is live on eBay
- **SOLD**: Product has been sold

---

## 🔗 Important URLs

### Development
- Local: http://localhost:3000
- Home: http://localhost:3000
- Products: http://localhost:3000/products

### Supabase
- Dashboard: https://app.supabase.com
- Project: https://app.supabase.com/project/{project-id}
- SQL Editor: https://app.supabase.com/project/{project-id}/sql
- Storage: https://app.supabase.com/project/{project-id}/storage/buckets

### Vercel
- Dashboard: https://vercel.com/dashboard
- Deployments: https://vercel.com/{username}/{project}

### eBay
- Seller Hub: https://www.ebay.com/sh/ovw
- Drafts: https://www.ebay.com/sh/lst/drafts
- Upload: Seller Hub → Reports → Upload

---

## 💡 Tips & Tricks

### Performance
- Amazon scraping can take 5-10 seconds
- Image upload happens in background
- Use pagination for large product lists

### Best Practices
- Test with a few products first
- Export CSV regularly (backup)
- Monitor Supabase storage usage
- Use meaningful product titles

### Keyboard Shortcuts
- `Ctrl/Cmd + K` - Focus search (browser)
- `Ctrl/Cmd + Click` - Open in new tab
- `Shift + Click` - Select range (future feature)

---

## 📞 Quick Help

**Need help?**
1. Check `README.md` for overview
2. See `SETUP.md` for detailed setup
3. Review `PROJECT_SUMMARY.md` for architecture
4. Open GitHub issue for bugs

**Before asking:**
- ✅ Check console for errors
- ✅ Verify environment variables
- ✅ Test with different ASIN
- ✅ Check Supabase status

---

## 🎯 Workflow Summary

### Daily Use
1. **Add Products**: Home → Enter ASIN → Add
2. **Manage**: Products → Edit/Update as needed
3. **Export**: Select → Export CSV
4. **Upload to eBay**: Seller Hub → Upload CSV
5. **Track**: Update status to POSTED → SOLD

### Weekly Maintenance
- Review INACTIVE products
- Export backup CSV
- Check storage usage
- Update sold items

---

*Keep this handy for quick reference!*

