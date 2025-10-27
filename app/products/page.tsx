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
      category_id: product.category_id || '175837',
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
    <div className="min-h-screen flex flex-col">
      {/* Modern Header */}
      <header className="sticky top-0 z-50 glass border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h1 className="text-xl font-bold gradient-text">eBay Bulk Lister</h1>
            </div>
            <button
              onClick={() => router.push('/')}
              className="btn-primary text-sm flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Product</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            {(['ALL', 'INACTIVE', 'POSTED', 'SOLD'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                  statusFilter === status
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Actions Bar */}
          {selectedIds.size > 0 && (
            <div className="card p-4 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex flex-wrap gap-3 items-center">
                <span className="text-sm font-medium text-gray-700">
                  {selectedIds.size} selected
                </span>
                <div className="flex-1 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleBulkStatusUpdate('POSTED')}
                    className="btn-secondary text-sm px-4 py-2"
                  >
                    Mark Posted
                  </button>
                  <button
                    onClick={() => handleBulkStatusUpdate('SOLD')}
                    className="btn-secondary text-sm px-4 py-2"
                  >
                    Mark Sold
                  </button>
                  <button
                    onClick={handleExportSelected}
                    className="btn-primary text-sm px-4 py-2"
                  >
                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export CSV
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    className="btn-danger text-sm px-4 py-2"
                  >
                    Delete
                  </button>
                </div>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Products Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === products.length && products.length > 0}
                        onChange={selectAll}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Image</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ASIN</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <p className="text-gray-500 font-medium">Loading products...</p>
                        </div>
                      </td>
                    </tr>
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <svg className="w-16 h-16 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                          <p className="text-gray-500 font-medium text-lg mb-2">No products found</p>
                          <p className="text-gray-400 text-sm">Add your first product to get started</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr 
                        key={product.id} 
                        className="hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 cursor-pointer transition-all duration-200 group"
                        onClick={() => toggleSelection(product.id)}
                      >
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={() => toggleSelection(product.id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-4">
                          {product.thumbnail ? (
                            <div className="relative w-20 h-20 rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow duration-200">
                              <Image
                                src={product.thumbnail}
                                alt={product.title}
                                fill
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center text-gray-400">
                              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <code className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-800">
                            {product.asin}
                          </code>
                        </td>
                        <td className="px-4 py-4 max-w-md" onClick={(e) => editingId === product.id && e.stopPropagation()}>
                          {editingId === product.id ? (
                            <input
                              type="text"
                              value={editValues.title || ''}
                              onChange={(e) =>
                                setEditValues({ ...editValues, title: e.target.value })
                              }
                              className="w-full px-3 py-2 border-2 border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="line-clamp-2 text-sm text-gray-900 font-medium">{product.title}</span>
                          )}
                        </td>
                        <td className="px-4 py-4" onClick={(e) => editingId === product.id && e.stopPropagation()}>
                          {editingId === product.id ? (
                            <input
                              type="text"
                              value={editValues.category_id || ''}
                              onChange={(e) =>
                                setEditValues({ ...editValues, category_id: e.target.value })
                              }
                              placeholder="175837"
                              className="w-24 px-3 py-2 border-2 border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                            />
                          ) : (
                            <span className="font-mono text-xs text-gray-600">{product.category_id || '175837'}</span>
                          )}
                        </td>
                        <td className="px-4 py-4" onClick={(e) => editingId === product.id && e.stopPropagation()}>
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
                              className="w-24 px-3 py-2 border-2 border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="font-semibold text-gray-900">{formatPrice(product.ebay_price)}</span>
                          )}
                        </td>
                        <td className="px-4 py-4" onClick={(e) => editingId === product.id && e.stopPropagation()}>
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
                              className="w-20 px-3 py-2 border-2 border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="text-gray-700 font-medium">{product.quantity}</span>
                          )}
                        </td>
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={product.status}
                            onChange={(e) =>
                              updateStatus(product.id, e.target.value as any)
                            }
                            className={`px-3 py-2 rounded-lg text-xs font-bold border-0 cursor-pointer transition-all duration-200 uppercase tracking-wide ${
                              product.status === 'POSTED'
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : product.status === 'SOLD'
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <option value="INACTIVE">INACTIVE</option>
                            <option value="POSTED">POSTED</option>
                            <option value="SOLD">SOLD</option>
                          </select>
                        </td>
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          {editingId === product.id ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveEdit(product.id)}
                                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-center">
                              <button
                                onClick={() => startEditing(product)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit product"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteSingle(product.id, product.title)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete product"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
              <div className="flex justify-center gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Previous</span>
                </button>
                <div className="flex items-center px-4 py-2 bg-white rounded-lg border border-gray-200">
                  <span className="font-semibold text-gray-900">
                    Page {page} of {totalPages}
                  </span>
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <span>Next</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

