'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Product, StatusFilter } from '@/lib/types';
import { formatPrice } from '@/utils/format';
import { toast } from 'sonner';
import Image from 'next/image';

export default function AllProductsPage(): JSX.Element {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Product>>({});

  useEffect(() => {
    fetchProducts();
  }, [page, statusFilter]);

  const fetchProducts = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/products?page=${page}&status=${statusFilter}`
      );
      const result = await response.json();

      if (result.success) {
        setProducts(result.data.products);
        setTotalPages(result.data.pagination.totalPages);
      }
    } catch (error) {
      console.error('[PRODUCTS_FETCH_ERROR]', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string): void => {
    const newSelection = new Set(selectedIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedIds(newSelection);
  };

  const selectAll = (): void => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
    }
  };

  const handleBulkStatusUpdate = async (status: 'POSTED' | 'SOLD' | 'INACTIVE'): Promise<void> => {
    if (selectedIds.size === 0) {
      toast.error('No products selected');
      return;
    }

    try {
      const response = await fetch('/api/products/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          updates: { status },
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Updated ${selectedIds.size} products to ${status}`);
        setSelectedIds(new Set());
        fetchProducts();
      } else {
        toast.error('Bulk update failed');
      }
    } catch (error) {
      console.error('[PRODUCTS_BULK_UPDATE_ERROR]', error);
      toast.error('Failed to update products');
    }
  };

  const handleExportSelected = async (): Promise<void> => {
    if (selectedIds.size === 0) {
      toast.error('No products selected');
      return;
    }

    const toastId = toast.loading('Generating CSV...');

    try {
      const response = await fetch('/api/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: Array.from(selectedIds) }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eBay-draft-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast.success('CSV downloaded successfully', { id: toastId });
        setSelectedIds(new Set());
      } else {
        toast.error('Export failed', { id: toastId });
      }
    } catch (error) {
      console.error('[CSV_EXPORT_ERROR]', error);
      toast.error('Failed to export CSV', { id: toastId });
    }
  };

  const handleDeleteSelected = async (): Promise<void> => {
    if (selectedIds.size === 0) {
      toast.error('No products selected');
      return;
    }

    if (!confirm(`Delete ${selectedIds.size} products? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Deleted ${selectedIds.size} products`);
        setSelectedIds(new Set());
        fetchProducts();
      } else {
        toast.error('Delete failed');
      }
    } catch (error) {
      console.error('[PRODUCTS_DELETE_ERROR]', error);
      toast.error('Failed to delete products');
    }
  };

  const handleDeleteSingle = async (id: string, title: string): Promise<void> => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Product deleted');
        setSelectedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        fetchProducts();
      } else {
        toast.error('Delete failed');
      }
    } catch (error) {
      console.error('[PRODUCT_DELETE_ERROR]', error);
      toast.error('Failed to delete product');
    }
  };

  const startEditing = (product: Product): void => {
    setEditingId(product.id);
    setEditValues({
      title: product.title,
      ebay_price: product.ebay_price,
      quantity: product.quantity,
      category_id: product.category_id,
    });
  };

  const saveEdit = async (id: string): Promise<void> => {
    try {
      const response = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates: editValues }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Product updated');
        setEditingId(null);
        fetchProducts();
      } else {
        toast.error('Update failed');
      }
    } catch (error) {
      console.error('[PRODUCT_UPDATE_ERROR]', error);
      toast.error('Failed to update product');
    }
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditValues({});
  };

  const updateStatus = async (id: string, status: 'POSTED' | 'SOLD' | 'INACTIVE'): Promise<void> => {
    try {
      const response = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates: { status } }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Status updated to ${status}`);
        fetchProducts();
      }
    } catch (error) {
      console.error('[STATUS_UPDATE_ERROR]', error);
      toast.error('Failed to update status');
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold gradient-text">All Products</h1>
          <button
            onClick={() => router.push('/')}
            className="btn-primary"
          >
            + Add Product
          </button>
        </div>

        {/* Toolbar */}
        <div className="card p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Status Filter */}
            <div className="flex gap-2">
              {(['ALL', 'INACTIVE', 'POSTED', 'SOLD'] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className={`status-filter ${
                    statusFilter === status
                      ? 'status-filter-active'
                      : 'status-filter-inactive'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Bulk Actions */}
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="btn-secondary text-sm"
                disabled={products.length === 0}
              >
                {selectedIds.size === products.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('POSTED')}
                className="btn-secondary text-sm"
                disabled={selectedIds.size === 0}
              >
                Mark Posted ({selectedIds.size})
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('SOLD')}
                className="btn-secondary text-sm"
                disabled={selectedIds.size === 0}
              >
                Mark Sold ({selectedIds.size})
              </button>
              <button
                onClick={handleExportSelected}
                className="btn-primary text-sm"
                disabled={selectedIds.size === 0}
              >
                Export CSV ({selectedIds.size})
              </button>
              <button
                onClick={handleDeleteSelected}
                className="btn-danger text-sm"
                disabled={selectedIds.size === 0}
              >
                Delete ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === products.length && products.length > 0}
                      onChange={selectAll}
                      className="w-4 h-4"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Image</th>
                  <th className="px-4 py-3 text-left">ASIN</th>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Price</th>
                  <th className="px-4 py-3 text-left">Qty</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No products found
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr 
                      key={product.id} 
                      className="border-b hover:bg-blue-50/50 cursor-pointer transition-colors duration-150"
                      onClick={() => toggleSelection(product.id)}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelection(product.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        {product.thumbnail ? (
                          <div className="relative w-16 h-16">
                            <Image
                              src={product.thumbnail}
                              alt={product.title}
                              fill
                              className="object-cover rounded"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-gray-400">
                            No Image
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{product.asin}</td>
                      <td className="px-4 py-3 max-w-md" onClick={(e) => editingId === product.id && e.stopPropagation()}>
                        {editingId === product.id ? (
                          <input
                            type="text"
                            value={editValues.title || ''}
                            onChange={(e) =>
                              setEditValues({ ...editValues, title: e.target.value })
                            }
                            className="w-full px-2 py-1 border rounded"
                          />
                        ) : (
                          <span className="line-clamp-2">{product.title}</span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => editingId === product.id && e.stopPropagation()}>
                        {editingId === product.id ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editValues.ebay_price || ''}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                ebay_price: parseFloat(e.target.value),
                              })
                            }
                            className="w-24 px-2 py-1 border rounded"
                          />
                        ) : (
                          formatPrice(product.ebay_price)
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => editingId === product.id && e.stopPropagation()}>
                        {editingId === product.id ? (
                          <input
                            type="number"
                            value={editValues.quantity || ''}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                quantity: parseInt(e.target.value),
                              })
                            }
                            className="w-16 px-2 py-1 border rounded"
                          />
                        ) : (
                          product.quantity
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={product.status}
                          onChange={(e) =>
                            updateStatus(product.id, e.target.value as any)
                          }
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border-0 cursor-pointer transition-all duration-200 ${
                            product.status === 'POSTED'
                              ? 'badge-posted shadow-sm'
                              : product.status === 'SOLD'
                              ? 'badge-sold shadow-sm'
                              : 'badge-inactive'
                          }`}
                        >
                          <option value="INACTIVE">INACTIVE</option>
                          <option value="POSTED">POSTED</option>
                          <option value="SOLD">SOLD</option>
                        </select>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {editingId === product.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(product.id)}
                              className="text-green-600 hover:text-green-700 text-sm font-medium hover:underline"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-gray-600 hover:text-gray-700 text-sm font-medium hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-3 items-center">
                            <button
                              onClick={() => startEditing(product)}
                              className="gradient-text text-sm font-medium hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteSingle(product.id, product.title)}
                              className="text-red-500 hover:text-red-700 transition-colors"
                              title="Delete product"
                            >
                              <svg 
                                className="w-4 h-4" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round" 
                                  strokeWidth={2} 
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                                />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 p-4 border-t">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary"
              >
                Previous
              </button>
              <span className="px-4 py-2 font-medium">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

