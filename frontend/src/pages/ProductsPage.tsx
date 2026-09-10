import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Package, Plus, Search, X } from 'lucide-react';
import { productsApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useDebounced } from '@/hooks/useDebounced';
import { ProductFormModal } from '@/features/products/ProductFormModal';
import { StockAdjustModal } from '@/features/products/StockAdjustModal';
import {
  EmptyState,
  ErrorState,
  LowStockBadge,
  PageHeader,
  PageLoader,
  Pagination,
  formatCurrency,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Product } from '@/types/api';

const LIMIT = 10;

export default function ProductsPage() {
  const { can } = useAuth();
  const canWrite = can('ADMIN', 'WAREHOUSE');

  // The dashboard links here with ?lowStock=true, so the filter reads from the URL.
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowStock, setLowStock] = useState(searchParams.get('lowStock') === 'true');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, lowStock]);

  useEffect(() => {
    setSearchParams(lowStock ? { lowStock: 'true' } : {}, { replace: true });
  }, [lowStock, setSearchParams]);

  const categories = useQuery({ queryKey: ['products', 'categories'], queryFn: productsApi.categories });

  const query = useQuery({
    queryKey: ['products', 'list', { debouncedSearch, category, lowStock, page }],
    queryFn: () =>
      productsApi.list({
        page,
        limit: LIMIT,
        search: debouncedSearch,
        category: category || undefined,
        lowStock: lowStock || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const hasFilters = Boolean(search || category || lowStock);

  function clearFilters() {
    setSearch('');
    setCategory('');
    setLowStock(false);
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Catalogue, pricing and stock levels."
        actions={
          canWrite && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={16} />
              Add product
            </button>
          )
        }
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input pl-9"
              placeholder="Search name, SKU, category, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search products"
            />
          </div>

          <select
            className="input w-auto"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={lowStock}
              onChange={(e) => setLowStock(e.target.checked)}
            />
            Low stock only
          </label>

          {hasFilters && (
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              <X size={15} />
              Clear
            </button>
          )}
        </div>

        {query.isLoading ? (
          <PageLoader />
        ) : query.isError ? (
          <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data && query.data.data.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No products match those filters' : 'No products yet'}
            description={hasFilters ? 'Try a different search or clear the filters.' : undefined}
            action={
              hasFilters ? (
                <button type="button" className="btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 text-right font-medium">Price</th>
                    <th className="px-4 py-2.5 text-right font-medium">In stock</th>
                    <th className="px-4 py-2.5 text-right font-medium">Alert at</th>
                    <th className="px-4 py-2.5 font-medium">Location</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data?.data.map((p) => (
                    <tr key={p.id} className={cn('hover:bg-slate-50', p.isLowStock && 'bg-red-50/40')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{p.name}</span>
                          {p.isLowStock && <LowStockBadge />}
                        </div>
                        <p className="font-mono text-xs text-slate-500">{p.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{p.category}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatCurrency(p.unitPrice)}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-semibold tabular-nums',
                          p.isLowStock ? 'text-red-600' : 'text-slate-900',
                        )}
                      >
                        {p.currentStock}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{p.minStockAlert}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{p.location}</td>
                      <td className="px-4 py-3 text-right">
                        {canWrite && (
                          <div className="flex justify-end gap-2 whitespace-nowrap">
                            <button
                              type="button"
                              className="text-sm font-medium text-brand-600 hover:text-brand-700"
                              onClick={() => setAdjusting(p)}
                            >
                              Adjust stock
                            </button>
                            <button
                              type="button"
                              className="text-sm font-medium text-slate-500 hover:text-slate-800"
                              onClick={() => {
                                setEditing(p);
                                setFormOpen(true);
                              }}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {query.data && (
              <Pagination
                page={query.data.meta.page}
                totalPages={query.data.meta.totalPages}
                total={query.data.meta.total}
                limit={query.data.meta.limit}
                onChange={setPage}
              />
            )}
          </>
        )}
      </div>

      {!canWrite && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Package size={14} />
          Your role can view the catalogue but not change it or move stock.
        </p>
      )}

      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        product={editing}
        categories={categories.data ?? []}
      />
      <StockAdjustModal open={Boolean(adjusting)} onClose={() => setAdjusting(null)} product={adjusting} />
    </>
  );
}
