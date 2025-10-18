# System Architecture 🏗️

Visual and technical architecture documentation for the eBay Bulk Lister application.

---

## 🎯 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                        │
│                      (Next.js Frontend)                      │
├──────────────────────┬──────────────────┬───────────────────┤
│   Home Page          │  Products Page   │   CSV Export      │
│   (ASIN Entry)       │  (Management)    │   (Download)      │
└──────────┬───────────┴────────┬─────────┴──────────┬────────┘
           │                    │                     │
           ▼                    ▼                     ▼
┌──────────────────────────────────────────────────────────────┐
│                        API ROUTES LAYER                       │
│                   (Next.js API Handlers)                      │
├────────────────┬──────────────────┬────────────────┬─────────┤
│ /api/scrape-   │ /api/products    │ /api/products/ │ /api/   │
│ amazon         │                  │ bulk-update    │ export- │
│                │                  │                │ csv     │
└────────┬───────┴────────┬─────────┴────────┬───────┴─────┬───┘
         │                │                  │             │
         ▼                ▼                  ▼             ▼
┌──────────────────────────────────────────────────────────────┐
│                     BUSINESS LOGIC LAYER                      │
│                  (Libraries & Utilities)                      │
├──────────────────┬──────────────────┬───────────────────────┤
│  Logger          │  CSV Generator   │  Type Definitions     │
│  (Logging)       │  (eBay Format)   │  (TypeScript)         │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                     DATA PERSISTENCE LAYER                    │
│                      (Supabase Backend)                       │
├──────────────────┬───────────────────┬───────────────────────┤
│  PostgreSQL DB   │  Storage Bucket   │  Row Level Security   │
│  (Products +     │  (Product Images) │  (Policies)           │
│   Images)        │                   │                       │
└──────────────────┴───────────────────┴───────────────────────┘
```

---

## 📊 Data Flow

### Adding a Product (ASIN Entry)

```
User Input (ASIN)
    │
    ▼
┌─────────────────────┐
│  Home Page (UI)     │
│  - Validate ASIN    │
│  - Show loading     │
└──────────┬──────────┘
           │
           │ POST /api/scrape-amazon
           ▼
┌─────────────────────┐
│  Scrape API Route   │
│  1. Check existing  │
│  2. Scrape Amazon   │
│  3. Process data    │
└──────────┬──────────┘
           │
           ├──► Amazon Website (HTTP Request)
           │    - Extract product data
           │    - Extract image URLs
           │
           ▼
┌─────────────────────┐
│  Supabase           │
│  1. Insert product  │
│  2. Download images │
│  3. Upload to       │
│     storage         │
│  4. Insert image    │
│     records         │
└──────────┬──────────┘
           │
           │ Response (product + images)
           ▼
┌─────────────────────┐
│  Home Page (UI)     │
│  - Show success     │
│  - Redirect to      │
│    products page    │
└─────────────────────┘
```

### Exporting CSV

```
User Selection
    │
    ▼
┌─────────────────────┐
│  Products Page (UI) │
│  - Select products  │
│  - Click export     │
└──────────┬──────────┘
           │
           │ POST /api/export-csv
           ▼
┌─────────────────────┐
│  Export API Route   │
│  1. Fetch products  │
│  2. Fetch images    │
│  3. Generate CSV    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  CSV Generator Lib  │
│  - Build eBay       │
│    template format  │
│  - Escape fields    │
│  - Format HTML      │
└──────────┬──────────┘
           │
           │ CSV file content
           ▼
┌─────────────────────┐
│  Products Page (UI) │
│  - Download file    │
│  - Show success     │
└─────────────────────┘
```

---

## 🗂️ Database Schema

```
┌─────────────────────────────────────────────────────────────┐
│                         PRODUCTS TABLE                       │
├──────────────────────┬──────────────────┬───────────────────┤
│ id (UUID, PK)        │ asin (TEXT)      │ sku (TEXT)        │
│ title (TEXT)         │ description      │ brand (TEXT)      │
│ amazon_price (DEC)   │ ebay_price (DEC) │ quantity (INT)    │
│ status (ENUM)        │ upc (TEXT)       │ category_id       │
│ dimensions (DEC[])   │ weight (DEC)     │ condition_id      │
│ raw_amazon_data (JSON)                  │ format (TEXT)     │
│ created_at (TS)      │ updated_at (TS)  │ exported_at (TS)  │
└──────────────────────┴──────────────────┴───────────────────┘
                              │
                              │ 1:N relationship
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PRODUCT_IMAGES TABLE                      │
├──────────────────────┬──────────────────┬───────────────────┤
│ id (UUID, PK)        │ product_id (FK)  │ image_url (TEXT)  │
│ storage_path (TEXT)  │ position (INT)   │ created_at (TS)   │
└──────────────────────┴──────────────────┴───────────────────┘
                              │
                              │ References
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE STORAGE BUCKET                   │
│                      'product-images'                        │
├──────────────────────┬──────────────────────────────────────┤
│ Path Structure:      │ Example:                             │
│ {ASIN}/{pos}.{ext}   │ B09XYZ1234/0.jpg                     │
│                      │ B09XYZ1234/1.jpg                     │
│ Public: Yes          │ Policy: Public read, Auth write      │
└──────────────────────┴──────────────────────────────────────┘
```

---

## 🔄 Component Structure

```
app/
├── layout.tsx (Root Layout)
│   ├── Toaster (Notifications)
│   └── children (Page content)
│
├── page.tsx (Home Page)
│   ├── QR Scanner Component
│   ├── ASIN Input Form
│   └── Navigation Button
│
└── products/
    └── page.tsx (Products Page)
        ├── Status Filter Buttons
        ├── Bulk Action Toolbar
        ├── Products Table
        │   ├── Checkbox Column
        │   ├── Image Column
        │   ├── Data Columns
        │   └── Actions Column
        └── Pagination Controls
```

---

## 🔌 API Route Architecture

```
app/api/
│
├── scrape-amazon/
│   └── route.ts
│       ├── POST handler
│       │   ├── Validate ASIN
│       │   ├── Check existing product
│       │   ├── scrapeAmazonProduct()
│       │   ├── Insert product to DB
│       │   └── uploadImagesToSupabase()
│       │
│       └── Helper Functions:
│           ├── scrapeAmazonProduct()
│           │   └── Use Cheerio to parse HTML
│           └── uploadImagesToSupabase()
│               └── Download → Upload → Record
│
├── products/
│   ├── route.ts
│   │   ├── GET handler (list with pagination)
│   │   ├── PATCH handler (update single)
│   │   └── DELETE handler (delete multiple)
│   │
│   └── bulk-update/
│       └── route.ts
│           └── POST handler (update multiple)
│
└── export-csv/
    └── route.ts
        └── POST handler
            ├── Fetch products + images
            ├── generateEbayDraftCsv()
            ├── Mark as exported
            └── Return CSV file
```

---

## 📚 Library Structure

```
lib/
│
├── types.ts
│   ├── Product interface
│   ├── ProductImage interface
│   ├── AmazonProduct interface
│   └── StatusFilter type
│
├── logger.ts
│   └── Logger class
│       ├── info()
│       ├── warn()
│       ├── error()
│       ├── perf()
│       └── measure()
│
├── csv-generator.ts
│   ├── generateEbayDraftCsv()
│   ├── buildHtmlDescription()
│   ├── escapeCsvField()
│   └── escapeHtml()
│
└── supabase.ts
    ├── supabase (client)
    └── supabaseAdmin (server)

utils/
└── format.ts
    ├── formatPrice()
    ├── formatDate()
    └── truncateText()
```

---

## 🎨 Styling Architecture

```
app/globals.css
│
├── @tailwind base
│   └── Base HTML styles
│
├── @tailwind components
│   ├── .btn-primary
│   ├── .btn-secondary
│   ├── .card
│   ├── .input
│   ├── .table (with thead, tbody, tr, td styles)
│   └── .badge (with variants)
│
└── @tailwind utilities
    ├── .line-clamp-2
    └── .line-clamp-3

tailwind.config.ts
└── Theme customization
    └── Extended colors, fonts, etc.
```

---

## 🔐 Security Model

```
┌──────────────────────────────────────────────────────┐
│                    FRONTEND (Public)                  │
│  - Uses NEXT_PUBLIC_* env vars                       │
│  - Anon key for client-side operations               │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ API calls
                      ▼
┌──────────────────────────────────────────────────────┐
│                   API ROUTES (Server)                 │
│  - Uses service role key                             │
│  - Full database access                              │
│  - Handles sensitive operations                      │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ Direct queries
                      ▼
┌──────────────────────────────────────────────────────┐
│                   SUPABASE (Backend)                  │
│  Database:                                           │
│  - RLS disabled (for dev)                           │
│  - Enable RLS for production                        │
│                                                      │
│  Storage:                                           │
│  - Public read policy                               │
│  - Authenticated write/delete                       │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 Deployment Architecture

### Development

```
Developer Machine
    │
    ├─► npm run dev
    │   └─► http://localhost:3000
    │
    └─► .env.local (local config)
```

### Production (Vercel)

```
GitHub Repository
    │
    │ Push to main
    ▼
Vercel (Auto Deploy)
    │
    ├─► Build Process
    │   ├─► npm install
    │   ├─► npm run build
    │   └─► Generate static files
    │
    ├─► Environment Variables
    │   └─► From Vercel dashboard
    │
    └─► Deploy to CDN
        └─► https://your-app.vercel.app

    Connected to:
    │
    └─► Supabase (Production DB)
```

---

## 📈 Scalability Considerations

### Current Limits
- **Products per page**: 50
- **Images per product**: 12
- **CSV export**: All selected products
- **Concurrent requests**: Limited by Supabase free tier

### Optimization Strategies

**Database:**
- Indexed columns (ASIN, status, created_at)
- Pagination for large datasets
- Efficient queries with proper JOINs

**Storage:**
- Image compression (can be added)
- CDN delivery via Supabase
- Lazy loading in UI

**API:**
- Rate limiting (can be added)
- Caching (can be added)
- Queue for batch operations (future)

**Frontend:**
- Code splitting (Next.js automatic)
- Image optimization (Next.js Image)
- Progressive loading

---

## 🔄 State Management

```
┌────────────────────────────────────────────┐
│         React Component State              │
├────────────────────────────────────────────┤
│  Products Page:                            │
│  - products (Product[])                    │
│  - loading (boolean)                       │
│  - page (number)                           │
│  - statusFilter (StatusFilter)             │
│  - selectedIds (Set<string>)               │
│  - editingId (string | null)               │
│  - editValues (Partial<Product>)           │
└────────────────────────────────────────────┘
         │
         │ useEffect → fetchProducts()
         ▼
┌────────────────────────────────────────────┐
│            API Layer                       │
│  fetch('/api/products?...')                │
└────────────────────────────────────────────┘
         │
         │ Response
         ▼
┌────────────────────────────────────────────┐
│         Update Component State             │
│  setProducts(data)                         │
│  setLoading(false)                         │
└────────────────────────────────────────────┘
```

No global state management (Zustand installed but not required for MVP)

---

## 🧪 Testing Strategy

### Manual Testing
- Unit operations (add, edit, delete)
- Bulk operations
- CSV export
- Camera scanning
- Edge cases (invalid ASIN, no images, etc.)

### Future Automated Testing
```
tests/
├── unit/
│   ├── csv-generator.test.ts
│   ├── logger.test.ts
│   └── format.test.ts
│
├── integration/
│   ├── api-products.test.ts
│   ├── api-scrape.test.ts
│   └── api-export.test.ts
│
└── e2e/
    ├── asin-entry.test.ts
    ├── product-management.test.ts
    └── csv-export.test.ts
```

---

## 📊 Performance Metrics

### Target Metrics
- **Page Load**: < 2s (initial load)
- **ASIN Entry**: 5-10s (includes Amazon scraping)
- **Product List**: < 1s (50 products)
- **CSV Export**: < 5s (100 products)
- **Image Upload**: 2-5s per image (background)

### Bottlenecks
1. **Amazon Scraping**: External API, can be slow
2. **Image Download**: Network dependent
3. **Large CSV**: Processing time increases linearly

---

## 🔮 Future Architecture Enhancements

### Planned Improvements
1. **Authentication**: User accounts with NextAuth.js
2. **Real-time Updates**: Supabase subscriptions
3. **Background Jobs**: Queue for scraping/uploads
4. **Caching**: Redis for frequently accessed data
5. **API Rate Limiting**: Prevent abuse
6. **Image Optimization**: Automatic compression
7. **Error Monitoring**: Sentry integration
8. **Analytics**: Product performance tracking

### Potential Scaling
```
Current:         Future:
┌─────────┐     ┌─────────┐
│ Next.js │     │ Next.js │
│ (Vercel)│     │ (Vercel)│
└────┬────┘     └────┬────┘
     │               │
     ▼               ├─► Redis (Cache)
┌─────────┐          ├─► Queue (Background Jobs)
│Supabase │          └─► Supabase (Primary DB)
└─────────┘
```

---

## 📝 Configuration Files

```
Configuration Layer
│
├── package.json
│   └── Dependencies, scripts, metadata
│
├── tsconfig.json
│   └── TypeScript compiler options
│
├── next.config.js
│   └── Next.js framework configuration
│   └── Image domains whitelist
│
├── tailwind.config.ts
│   └── Tailwind CSS customization
│
├── postcss.config.js
│   └── PostCSS plugins
│
├── .eslintrc.json
│   └── Linting rules
│
├── .prettierrc
│   └── Code formatting rules
│
├── .gitignore
│   └── Git ignored files
│
├── vercel.json
│   └── Vercel deployment config
│
└── .env.local
    └── Environment variables (not in git)
```

---

This architecture is designed to be:
- ✅ **Scalable**: Easy to add features
- ✅ **Maintainable**: Clear separation of concerns
- ✅ **Performant**: Optimized queries and rendering
- ✅ **Secure**: Proper key management
- ✅ **Testable**: Modular components

---

*Architecture documentation - Last updated: October 18, 2025*

