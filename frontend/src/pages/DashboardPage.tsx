import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, Package, ClipboardList, AlertTriangle, CalendarClock, FileText } from 'lucide-react';
import { challansApi, customersApi, productsApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import {
  ChallanStatusBadge,
  ErrorState,
  PageHeader,
  PageLoader,
  StatCard,
  formatCurrency,
  formatDate,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();

  const customers = useQuery({ queryKey: ['customers', 'summary'], queryFn: customersApi.summary });
  const products = useQuery({ queryKey: ['products', 'summary'], queryFn: productsApi.summary });
  const challans = useQuery({ queryKey: ['challans', 'summary'], queryFn: challansApi.summary });
  const lowStock = useQuery({ queryKey: ['products', 'low-stock'], queryFn: productsApi.lowStock });
  const recentChallans = useQuery({
    queryKey: ['challans', 'recent'],
    queryFn: () => challansApi.list({ limit: 5, sortBy: 'createdAt', sortOrder: 'desc' }),
  });

  const isLoading =
    customers.isLoading || products.isLoading || challans.isLoading || lowStock.isLoading;

  const error = customers.error ?? products.error ?? challans.error ?? lowStock.error;

  if (isLoading) return <PageLoader />;

  if (error) {
    return (
      <ErrorState
        message={getApiErrorMessage(error)}
        onRetry={() => {
          void customers.refetch();
          void products.refetch();
          void challans.refetch();
          void lowStock.refetch();
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle="Today's position across customers, stock and dispatch."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Customers" value={customers.data?.total ?? 0} icon={<Users size={16} />} />
        <StatCard label="Open leads" value={customers.data?.leads ?? 0} tone="warning" />
        <StatCard
          label="Follow-ups due"
          value={customers.data?.followUpsDue ?? 0}
          tone={customers.data?.followUpsDue ? 'warning' : 'default'}
          icon={<CalendarClock size={16} />}
        />
        <StatCard label="Products" value={products.data?.total ?? 0} icon={<Package size={16} />} />
        <StatCard
          label="Low stock"
          value={products.data?.lowStock ?? 0}
          tone={products.data?.lowStock ? 'danger' : 'success'}
          icon={<AlertTriangle size={16} />}
        />
        <StatCard
          label="Draft challans"
          value={challans.data?.drafts ?? 0}
          icon={<ClipboardList size={16} />}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Low stock */}
        <section className="card">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Needs reordering</h2>
            <Link to="/products?lowStock=true" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>

          {lowStock.data && lowStock.data.length > 0 ? (
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Product</th>
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 text-right font-medium">In stock</th>
                    <th className="px-4 py-2 text-right font-medium">Alert at</th>
                    <th className="px-4 py-2 text-right font-medium">Short by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStock.data.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{p.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.sku}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-red-600">
                        {p.currentStock}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                        {p.minStockAlert}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{p.shortBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Every product is above its alert level.
            </p>
          )}
        </section>

        {/* Recent challans */}
        <section className="card">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Recent challans</h2>
            <Link to="/challans" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>

          {recentChallans.data && recentChallans.data.data.length > 0 ? (
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Number</th>
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                    <th className="px-4 py-2 text-right font-medium">Raised</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentChallans.data.data.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-900">
                        {c.challanNumber}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{c.customerBusinessName}</td>
                      <td className="px-4 py-2.5">
                        <ChallanStatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {formatCurrency(c.totalAmount)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                        {formatDate(c.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No challans raised yet.</p>
          )}
        </section>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Confirmed challans"
          value={challans.data?.confirmed ?? 0}
          tone="success"
          icon={<FileText size={16} />}
        />
        <StatCard label="Cancelled" value={challans.data?.cancelled ?? 0} />
        <StatCard label="Raised today" value={challans.data?.createdToday ?? 0} />
        <StatCard
          label="Confirmed value"
          value={formatCurrency(challans.data?.confirmedValue ?? 0)}
          tone="success"
        />
      </div>
    </>
  );
}
