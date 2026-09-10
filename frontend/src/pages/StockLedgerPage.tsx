import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { productsApi, stockApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import {
  EmptyState,
  ErrorState,
  MovementBadge,
  PageHeader,
  PageLoader,
  Pagination,
  formatDateTime,
} from '@/components/ui';

const LIMIT = 20;

export default function StockLedgerPage() {
  const [productId, setProductId] = useState('');
  const [movementType, setMovementType] = useState('');
  const [referenceType, setReferenceType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [productId, movementType, referenceType, from, to]);

  const products = useQuery({
    queryKey: ['products', 'all-for-filter'],
    queryFn: () => productsApi.list({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const query = useQuery({
    queryKey: ['stock', 'list', { productId, movementType, referenceType, from, to, page }],
    queryFn: () =>
      stockApi.list({
        page,
        limit: LIMIT,
        productId: productId || undefined,
        movementType: movementType || undefined,
        referenceType: referenceType || undefined,
        from: from || undefined,
        to: to || undefined,
        sortOrder: 'desc',
      }),
    placeholderData: keepPreviousData,
  });

  const hasFilters = Boolean(productId || movementType || referenceType || from || to);

  function clearFilters() {
    setProductId('');
    setMovementType('');
    setReferenceType('');
    setFrom('');
    setTo('');
  }

  return (
    <>
      <PageHeader
        title="Stock ledger"
        subtitle="Every movement, with the balance it produced. Written only by the transaction that changed the stock."
      />

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <select
            className="input w-auto min-w-[180px]"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            aria-label="Filter by product"
          >
            <option value="">All products</option>
            {products.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="input w-auto"
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
            aria-label="Filter by direction"
          >
            <option value="">IN and OUT</option>
            <option value="IN">IN only</option>
            <option value="OUT">OUT only</option>
          </select>

          <select
            className="input w-auto"
            value={referenceType}
            onChange={(e) => setReferenceType(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="">Any source</option>
            <option value="CHALLAN">Caused by a challan</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            From
            <input
              type="date"
              className="input w-auto"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            To
            <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
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
            title="No movements match those filters"
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
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Direction</th>
                    <th className="px-4 py-2.5 text-right font-medium">Quantity</th>
                    <th className="px-4 py-2.5 text-right font-medium">Balance after</th>
                    <th className="px-4 py-2.5 font-medium">Reason</th>
                    <th className="px-4 py-2.5 font-medium">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data?.data.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{m.product?.name}</p>
                        <p className="font-mono text-xs text-slate-500">{m.product?.sku}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <MovementBadge type={m.movementType} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-800">
                        {m.movementType === 'IN' ? '+' : '−'}
                        {m.quantityChanged}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                        {m.balanceAfter}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {m.reason}
                        {m.referenceType === 'CHALLAN' && m.referenceId && (
                          <Link
                            to={`/challans/${m.referenceId}`}
                            className="ml-2 text-xs font-medium text-brand-600 hover:text-brand-700"
                          >
                            View challan
                          </Link>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                        {m.createdBy.name}
                        <span className="ml-1 text-slate-400">({m.createdBy.role})</span>
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
    </>
  );
}
