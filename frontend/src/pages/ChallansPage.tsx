import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { challansApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useDebounced } from '@/hooks/useDebounced';
import {
  ChallanStatusBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  Pagination,
  StatCard,
  formatCurrency,
  formatDate,
} from '@/components/ui';

const LIMIT = 10;

export default function ChallansPage() {
  const { can } = useAuth();
  const canRaise = can('ADMIN', 'SALES');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const summary = useQuery({ queryKey: ['challans', 'summary'], queryFn: challansApi.summary });

  const query = useQuery({
    queryKey: ['challans', 'list', { debouncedSearch, status, page }],
    queryFn: () =>
      challansApi.list({
        page,
        limit: LIMIT,
        search: debouncedSearch,
        status: status || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const hasFilters = Boolean(search || status);

  return (
    <>
      <PageHeader
        title="Sales challans"
        subtitle="Dispatch documents. Stock moves when a challan is confirmed, not when it is raised."
        actions={
          canRaise && (
            <Link to="/challans/new" className="btn-primary">
              <Plus size={16} />
              New challan
            </Link>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Drafts" value={summary.data?.drafts ?? 0} />
        <StatCard label="Confirmed" value={summary.data?.confirmed ?? 0} tone="success" />
        <StatCard label="Cancelled" value={summary.data?.cancelled ?? 0} />
        <StatCard
          label="Confirmed value"
          value={formatCurrency(summary.data?.confirmedValue ?? 0)}
          tone="success"
        />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input pl-9"
              placeholder="Search challan number, customer, mobile…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search challans"
            />
          </div>

          <select
            className="input w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {hasFilters && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch('');
                setStatus('');
              }}
            >
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
            title={hasFilters ? 'No challans match those filters' : 'No challans raised yet'}
            description={canRaise && !hasFilters ? 'Raise one to dispatch goods to a customer.' : undefined}
            action={
              canRaise && !hasFilters ? (
                <Link to="/challans/new" className="btn-primary">
                  <Plus size={16} />
                  New challan
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Number</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Lines</th>
                    <th className="px-4 py-2.5 text-right font-medium">Units</th>
                    <th className="px-4 py-2.5 text-right font-medium">Value</th>
                    <th className="px-4 py-2.5 text-right font-medium">Raised</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data?.data.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/challans/${c.id}`}
                          className="font-mono text-xs font-semibold text-slate-900 hover:text-brand-700"
                        >
                          {c.challanNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{c.customerBusinessName}</p>
                        <p className="text-xs text-slate-500">{c.customerName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <ChallanStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {c._count?.items ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{c.totalQuantity}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                        {formatCurrency(c.totalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-500">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/challans/${c.id}`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          View
                        </Link>
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
