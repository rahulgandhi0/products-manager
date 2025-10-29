# Posted Timestamp & Aged Listings Feature

## Overview

This feature automatically tracks when products are moved to the "POSTED" status and identifies products that have been posted for more than 30 days as "AGED". Aged listings can be renewed with a single click to reset the timer.

## How It Works

### Database-Level Tracking
- A new `posted_at` timestamp column has been added to the `products` table
- A database trigger automatically sets `posted_at` when a product's status changes to "POSTED"
- If a product is moved back to "INACTIVE" and then to "POSTED" again, `posted_at` is updated to the new timestamp
- When status changes away from "POSTED", `posted_at` is cleared (set to NULL)

### Aged Listings Logic
- Products are considered "AGED" if:
  - Status is currently "POSTED"
  - `posted_at` is set
  - `posted_at` is more than 30 days ago
- Only items that are still in POSTED status appear in the Aged filter

## UI Features

### Filter Pills
- New "Aged" filter pill with orange/red styling
- Located in the products page alongside ALL, INACTIVE, POSTED, and SOLD filters
- Shows only items currently in POSTED status that are 30+ days old

### Visual Indicators
- **Aged listings** (POSTED items 30+ days old) have:
  - Orange background highlight in the table
  - Orange left border (4px)
  - Orange status dropdown background
  - Warning emoji (⚠️) next to days count
  - **Renew button** to reset the timer

- **Recent posted products** show:
  - Green status dropdown
  - Days since posted below the status
  - Example: "5 days ago"

### Status Column
- Shows status dropdown
- For POSTED products, displays days since posted
- Color-coded:
  - Green for recent posts (< 30 days)
  - Orange with warning for aged listings (≥ 30 days)

### Renew Button
- Appears in the Actions column for aged listings
- Orange button with refresh icon
- Clicking "Renew" resets the `posted_at` timestamp to current time
- Timer starts fresh from 0 days
- Listing moves out of "Aged" filter immediately

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
- Now supports `status=AGED` filter parameter
- Returns only products that are currently POSTED and older than 30 days

### PATCH /api/products
- Automatically sets `posted_at` via database trigger when status changes to "POSTED"
- Supports manual `posted_at` updates for renewing listings
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

export type StatusFilter = 'ALL' | 'INACTIVE' | 'POSTED' | 'SOLD' | 'AGED'; // UPDATED
```

## Benefits

1. **Automatic Tracking**: No manual work required - the database trigger handles everything
2. **Historical Accuracy**: If you move a product back to INACTIVE and then POSTED again, the timestamp resets
3. **Visual Alerts**: Aged listings are immediately visible with orange highlighting
4. **One-Click Renewal**: Reset the timer instantly with the Renew button
5. **Better Inventory Management**: Quickly identify listings that may need attention or relisting
6. **Only Active Listings**: Aged filter only shows items currently in POSTED status
7. **Audit Trail**: Logs in console show when status changes occur

## Files Modified

- `database/schema.sql` - Added `posted_at` column, index, and trigger
- `database/migration_add_posted_at.sql` - NEW migration file for existing databases
- `lib/types.ts` - Added `posted_at` field and `AGED` status filter
- `app/api/products/route.ts` - Added AGED filter logic and logging
- `app/api/products/bulk-update/route.ts` - Added logging for status changes
- `app/products/page.tsx` - Added AGED filter UI, visual indicators, days counter, and Renew button

## Testing

1. Create or update a product to "POSTED" status
2. Check that `posted_at` is automatically set in the database
3. Change the product back to "INACTIVE" - `posted_at` should be cleared
4. Change it to "POSTED" again - `posted_at` should be set to the new timestamp
5. To test the AGED filter, manually set `posted_at` to 31+ days ago in the database:
   ```sql
   UPDATE products 
   SET posted_at = NOW() - INTERVAL '31 days' 
   WHERE id = 'your-product-id' AND status = 'POSTED';
   ```
6. View the product in the UI - it should show orange highlighting and appear in the AGED filter
7. Click the "Renew" button - `posted_at` should reset to current time and item moves out of AGED filter
8. Verify that only POSTED items appear in AGED filter (not INACTIVE or SOLD items)

