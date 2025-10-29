# Posted Timestamp & Expired Products Feature

## Overview

This feature automatically tracks when products are moved to the "POSTED" status and identifies products that have been posted for more than 30 days as "EXPIRED".

## How It Works

### Database-Level Tracking
- A new `posted_at` timestamp column has been added to the `products` table
- A database trigger automatically sets `posted_at` when a product's status changes to "POSTED"
- If a product is moved back to "INACTIVE" and then to "POSTED" again, `posted_at` is updated to the new timestamp
- When status changes away from "POSTED", `posted_at` is cleared (set to NULL)

### Expired Products Logic
- Products are considered "EXPIRED" if:
  - Status is "POSTED"
  - `posted_at` is set
  - `posted_at` is more than 30 days ago

## UI Features

### Filter Pills
- New "EXPIRED (30+ days)" filter pill with orange/red styling
- Located in the products page alongside ALL, INACTIVE, POSTED, and SOLD filters

### Visual Indicators
- **Expired products** have:
  - Orange background highlight in the table
  - Orange left border (4px)
  - Orange status dropdown background
  - Warning emoji (⚠️) next to days count

- **Posted products** show:
  - Green status dropdown
  - Days since posted below the status
  - Example: "5 days ago"

### Status Column
- Shows status dropdown
- For POSTED products, displays days since posted
- Color-coded:
  - Green for recent posts (< 30 days)
  - Orange with warning for expired (≥ 30 days)

## Migration Instructions

### For Existing Databases

Run the migration file to add the `posted_at` column and trigger:

```bash
# Connect to your Supabase database and run:
psql -h your-db-host -U postgres -d your-db-name -f database/migration_add_posted_at.sql
```

Or use the Supabase SQL Editor:
1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `database/migration_add_posted_at.sql`
4. Execute the SQL

### Backfilling Existing Data (Optional)

If you have existing products with status "POSTED" and want to set their `posted_at` to their `updated_at` time:

```sql
UPDATE products 
SET posted_at = updated_at 
WHERE status = 'POSTED' AND posted_at IS NULL;
```

**Note:** This is optional. If you skip this step, existing POSTED products will only get `posted_at` set when their status is changed.

## API Changes

### GET /api/products
- Now supports `status=EXPIRED` filter parameter
- Returns products that are POSTED and older than 30 days

### PATCH /api/products
- Automatically sets `posted_at` via database trigger when status changes to "POSTED"
- Logs status changes for tracking

### POST /api/products/bulk-update
- Automatically sets `posted_at` via database trigger for bulk status updates
- Logs bulk status changes

## TypeScript Types

Updated `Product` interface in `lib/types.ts`:
```typescript
export interface Product {
  // ... other fields
  posted_at?: string;  // NEW: ISO 8601 timestamp
}

export type StatusFilter = 'ALL' | 'INACTIVE' | 'POSTED' | 'SOLD' | 'EXPIRED'; // UPDATED
```

## Benefits

1. **Automatic Tracking**: No manual work required - the database trigger handles everything
2. **Historical Accuracy**: If you move a product back to INACTIVE and then POSTED again, the timestamp resets
3. **Visual Alerts**: Expired products are immediately visible with orange highlighting
4. **Better Inventory Management**: Quickly identify stale listings that may need attention
5. **Audit Trail**: Logs in console show when status changes occur

## Files Modified

- `database/schema.sql` - Added `posted_at` column, index, and trigger
- `database/migration_add_posted_at.sql` - NEW migration file for existing databases
- `lib/types.ts` - Added `posted_at` field and `EXPIRED` status filter
- `app/api/products/route.ts` - Added EXPIRED filter logic and logging
- `app/api/products/bulk-update/route.ts` - Added logging for status changes
- `app/products/page.tsx` - Added EXPIRED filter UI, visual indicators, and days counter

## Testing

1. Create or update a product to "POSTED" status
2. Check that `posted_at` is automatically set in the database
3. Change the product back to "INACTIVE" - `posted_at` should be cleared
4. Change it to "POSTED" again - `posted_at` should be set to the new timestamp
5. To test the EXPIRED filter, manually set `posted_at` to 31+ days ago in the database:
   ```sql
   UPDATE products 
   SET posted_at = NOW() - INTERVAL '31 days' 
   WHERE id = 'your-product-id';
   ```
6. View the product in the UI - it should show orange highlighting and appear in the EXPIRED filter

