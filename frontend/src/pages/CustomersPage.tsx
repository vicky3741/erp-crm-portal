import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { customersApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useDebounced } from '@/hooks/useDebounced';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  Pagination,
  StatusBadge,
  TypeBadge,
  formatDate,
} from '@/components/ui';
import type { Customer } from '@/types/api';

const LIMIT = 10;

export default function CustomersPage() {
  const { can } = useAuth();
  const canWrite = can('ADMIN', 'SALES');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [followUpDue, setFollowUpDue] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const debouncedSearch = useDebounced(search);

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, customerType, followUpDue]);

  const query = useQuery({
    queryKey: ['customers', 'list', { debouncedSearch, status, customerType, followUpDue, page }],
    queryFn: () =>
      customersApi.list({
        page,
        limit: LIMIT,
        search: debouncedSearch,
        status: status || undefined,
        customerType: customerType || undefined,
        followUpDue: followUpDue || undefined,
      }),
    // Keeps the previous page visible while the next one loads, instead of
    // collapsing the table to a spinner on every keystroke.
    placeholderData: keepPreviousData,
  });

  const hasFilters = Boolean(search || status || customerType || followUpDue);

  function clearFilters() {
    setSearch('');
    setStatus('');
    setCustomerType('');
    setFollowUpDue(false);
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setFormOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Leads, active accounts and follow-ups."
        actions={
          canWrite && (
            <button type="button" className="btn-primary" onClick={openCreate}>
              <Plus size={16} />
              Add customer
            </button>
          )
        }
      />

      <div className="card">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="input pl-9"
              placeholder="Search name, mobile, email, business, GST…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search customers"
            />
          </div>

          <select
            className="input w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="LEAD">Lead</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <select
            className="input w-auto"
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
            aria-label="Filter by customer type"
          >
            <option value="">All types</option>
            <option value="RETAIL">Retail</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="DISTRIBUTOR">Distributor</option>
          </select>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={followUpDue}
              onChange={(e) => setFollowUpDue(e.target.checked)}
            />
            Follow-up due
          </label>

          {hasFilters && (
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              <X size={15} />
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        {query.isLoading ? (
          <PageLoader />
        ) : query.isError ? (
          <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data && query.data.data.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No customers match those filters' : 'No customers yet'}
            description={
              hasFilters
                ? 'Try a different search term or clear the filters.'
                : canWrite
                  ? 'Add your first customer to get started.'
                  : undefined
            }
            action={
              hasFilters ? (
                <button type="button" className="btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : canWrite ? (
                <button type="button" className="btn-primary" onClick={openCreate}>
                  <Plus size={16} />
                  Add customer
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
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Contact</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Follow-up</th>
                    <th className="px-4 py-2.5 text-right font-medium">Challans</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data?.data.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/customers/${c.id}`}
                          className="font-medium text-slate-900 hover:text-brand-700"
                        >
                          {c.businessName}
                        </Link>
                        <p className="text-xs text-slate-500">{c.name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="tabular-nums text-slate-700">{c.mobile}</p>
                        <p className="text-xs text-slate-500">{c.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge type={c.customerType} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(c.followUpDate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {c._count?.challans ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            to={`/customers/${c.id}`}
                            className="text-sm font-medium text-brand-600 hover:text-brand-700"
                          >
                            View
                          </Link>
                          {canWrite && (
                            <button
                              type="button"
                              className="text-sm font-medium text-slate-500 hover:text-slate-800"
                              onClick={() => openEdit(c)}
                            >
                              Edit
                            </button>
                          )}
                        </div>
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

      <CustomerFormModal open={formOpen} onClose={() => setFormOpen(false)} customer={editing} />
    </>
  );
}
