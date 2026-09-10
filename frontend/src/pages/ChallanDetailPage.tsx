import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, AlertTriangle, Check, Ban } from 'lucide-react';
import { challansApi } from '@/api/endpoints';
import { getApiErrorMessage, getInsufficientStock } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import {
  ChallanStatusBadge,
  ErrorState,
  Field,
  Modal,
  MovementBadge,
  PageLoader,
  Spinner,
  formatCurrency,
  formatDateTime,
} from '@/components/ui';
import type { InsufficientStockDetail } from '@/types/api';

export default function ChallanDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const canConfirm = can('ADMIN', 'SALES', 'WAREHOUSE');
  const canCancel = can('ADMIN');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [shortfalls, setShortfalls] = useState<InsufficientStockDetail[]>([]);

  const query = useQuery({
    queryKey: ['challans', 'detail', id],
    queryFn: () => challansApi.get(id),
    enabled: Boolean(id),
  });

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['challans'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['stock'] });
  }

  const confirm = useMutation({
    mutationFn: () => challansApi.confirm(id),
    onSuccess: (response) => {
      setShortfalls([]);
      toast.success(response.message ?? 'Challan confirmed');
      invalidateAll();
    },
    onError: (error) => {
      const insufficient = getInsufficientStock(error);
      if (insufficient) setShortfalls(insufficient);
      toast.error(getApiErrorMessage(error, 'Could not confirm the challan'));
    },
  });

  const cancel = useMutation({
    mutationFn: () => challansApi.cancel(id, cancelReason),
    onSuccess: (response) => {
      toast.success(response.message ?? 'Challan cancelled');
      setCancelOpen(false);
      setCancelReason('');
      invalidateAll();
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Could not cancel the challan')),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) {
    return <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const challan = query.data;
  if (!challan) return null;

  return (
    <>
      <Link
        to="/challans"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Back to challans
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold text-slate-900">{challan.challanNumber}</h1>
            <ChallanStatusBadge status={challan.status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            <Link to={`/customers/${challan.customerId}`} className="hover:text-brand-700">
              {challan.customerBusinessName}
            </Link>{' '}
            · {challan.customerName} · {challan.customerMobile}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {challan.status === 'DRAFT' && canConfirm && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => confirm.mutate()}
              disabled={confirm.isPending}
            >
              {confirm.isPending ? <Spinner /> : <Check size={16} />}
              Confirm &amp; deduct stock
            </button>
          )}
          {challan.status !== 'CANCELLED' && canCancel && (
            <button type="button" className="btn-danger" onClick={() => setCancelOpen(true)}>
              <Ban size={15} />
              Cancel
            </button>
          )}
        </div>
      </div>

      {shortfalls.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="flex items-center gap-2 font-medium text-red-800">
            <AlertTriangle size={16} />
            Not enough stock to confirm this challan
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {shortfalls.map((s) => (
              <li key={s.productId}>
                <span className="font-medium">{s.productName}</span> ({s.sku}) — asked for {s.requested},
                only {s.available} available, short by {s.shortBy}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-red-600">
            Nothing was deducted. The whole confirmation rolled back, including the lines that had enough
            stock.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Items */}
        <section className="card lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Items</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Names and prices are a snapshot taken when the challan was raised — editing the product later
              does not change this document.
            </p>
          </div>

          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2 text-right font-medium">Quantity</th>
                  <th className="px-4 py-2 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {challan.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{item.productName}</p>
                      <p className="font-mono text-xs text-slate-500">
                        {item.productSku} · {item.productCategory}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">
                      {formatCurrency(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td className="px-4 py-2.5 font-medium text-slate-700">Total</td>
                  <td />
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                    {challan.totalQuantity}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                    {formatCurrency(challan.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Audit */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Audit trail</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Raised by</dt>
              <dd className="mt-0.5 text-slate-800">
                {challan.createdBy.name} ({challan.createdBy.role})
                <span className="block text-xs text-slate-500">{formatDateTime(challan.createdAt)}</span>
              </dd>
            </div>

            {challan.confirmedBy && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Confirmed by</dt>
                <dd className="mt-0.5 text-slate-800">
                  {challan.confirmedBy.name} ({challan.confirmedBy.role})
                  <span className="block text-xs text-slate-500">{formatDateTime(challan.confirmedAt)}</span>
                </dd>
              </div>
            )}

            {challan.cancelledBy && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Cancelled by</dt>
                <dd className="mt-0.5 text-slate-800">
                  {challan.cancelledBy.name} ({challan.cancelledBy.role})
                  <span className="block text-xs text-slate-500">{formatDateTime(challan.cancelledAt)}</span>
                  {challan.cancelReason && (
                    <span className="mt-1 block text-xs italic text-slate-600">“{challan.cancelReason}”</span>
                  )}
                </dd>
              </div>
            )}

            {challan.notes && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Notes</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{challan.notes}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {/* Stock movements */}
      <section className="card mt-4">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Stock movements caused by this challan</h2>
        </div>

        {challan.stockMovements.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            None yet — a draft does not move stock. Confirming it will write one OUT movement per line.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Direction</th>
                  <th className="px-4 py-2 text-right font-medium">Quantity</th>
                  <th className="px-4 py-2 text-right font-medium">Balance after</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {challan.stockMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-800">
                      {m.product.name}
                      <span className="ml-1 font-mono text-xs text-slate-500">({m.product.sku})</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <MovementBadge type={m.movementType} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {m.movementType === 'IN' ? '+' : '−'}
                      {m.quantityChanged}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                      {m.balanceAfter}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${challan.challanNumber}?`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCancelOpen(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending || cancelReason.trim().length < 3}
            >
              {cancel.isPending && <Spinner />}
              Cancel challan
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          {challan.status === 'CONFIRMED'
            ? 'This challan is confirmed, so cancelling will return its stock as IN movements referencing the challan. The original OUT movements are kept — nothing is deleted to make the numbers work.'
            : 'This challan is a draft, so no stock has moved and none will be returned.'}
        </p>
        <Field label="Reason" required hint="At least 3 characters — it is recorded against the challan">
          <input
            className="input"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Customer cancelled the order"
          />
        </Field>
      </Modal>
    </>
  );
}
