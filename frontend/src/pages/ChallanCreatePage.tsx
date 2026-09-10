import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { challansApi, customersApi, productsApi } from '@/api/endpoints';
import { getApiErrorMessage, getInsufficientStock } from '@/api/client';
import { useDebounced } from '@/hooks/useDebounced';
import {
  Field,
  PageHeader,
  PageLoader,
  Spinner,
  formatCurrency,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type { InsufficientStockDetail } from '@/types/api';

interface Line {
  productId: string;
  quantity: string;
}

export default function ChallanCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '' }]);
  const [shortfalls, setShortfalls] = useState<InsufficientStockDetail[]>([]);

  const debouncedCustomerSearch = useDebounced(customerSearch);

  const customers = useQuery({
    queryKey: ['customers', 'picker', debouncedCustomerSearch],
    queryFn: () => customersApi.list({ limit: 50, search: debouncedCustomerSearch, status: undefined }),
  });

  const products = useQuery({
    queryKey: ['products', 'picker'],
    queryFn: () => productsApi.list({ limit: 100, sortBy: 'name', sortOrder: 'asc' }),
  });

  const productById = useMemo(
    () => new Map((products.data?.data ?? []).map((p) => [p.id, p])),
    [products.data],
  );

  const resolvedLines = lines.map((line) => {
    const product = productById.get(line.productId);
    const qty = Number(line.quantity);
    const validQty = Number.isInteger(qty) && qty > 0;
    const lineTotal = product && validQty ? Number(product.unitPrice) * qty : 0;
    // Warn before submitting; the server is still the authority.
    const exceedsStock = Boolean(product && validQty && qty > product.currentStock);
    return { ...line, product, qty, validQty, lineTotal, exceedsStock };
  });

  const totalQuantity = resolvedLines.reduce((s, l) => s + (l.validQty ? l.qty : 0), 0);
  const totalAmount = resolvedLines.reduce((s, l) => s + l.lineTotal, 0);
  const anyExceeds = resolvedLines.some((l) => l.exceedsStock);

  const validLines = resolvedLines.filter((l) => l.product && l.validQty);
  const canSubmit = Boolean(customerId) && validLines.length > 0;

  const mutation = useMutation({
    mutationFn: (confirm: boolean) =>
      challansApi.create({
        customerId,
        items: validLines.map((l) => ({ productId: l.productId, quantity: l.qty })),
        notes: notes.trim() || null,
        confirm,
      }),
    onSuccess: (response) => {
      toast.success(response.message ?? 'Challan saved');
      void queryClient.invalidateQueries({ queryKey: ['challans'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      navigate(`/challans/${response.data.id}`);
    },
    onError: (error) => {
      const insufficient = getInsufficientStock(error);
      if (insufficient) setShortfalls(insufficient);
      toast.error(getApiErrorMessage(error, 'Could not save the challan'));
    },
  });

  function updateLine(index: number, patch: Partial<Line>) {
    setShortfalls([]);
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantity: '' }]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  if (products.isLoading || customers.isLoading) return <PageLoader />;

  const shortfallBySku = new Map(shortfalls.map((s) => [s.sku, s]));

  return (
    <>
      <Link
        to="/challans"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Back to challans
      </Link>

      <PageHeader
        title="New sales challan"
        subtitle="Saving a draft does not move stock. Confirming deducts it in a single transaction."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Customer */}
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Customer</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Find a customer">
                <input
                  className="input"
                  placeholder="Search by name, business, mobile…"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </Field>
              <Field label="Customer" required>
                <select
                  className="input"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                >
                  <option value="">Select a customer…</option>
                  {customers.data?.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} — {c.name} ({c.mobile})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Lines */}
          <section className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Items</h2>
              <button type="button" className="btn-secondary" onClick={addLine}>
                <Plus size={15} />
                Add line
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {resolvedLines.map((line, index) => {
                const shortfall = line.product ? shortfallBySku.get(line.product.sku) : undefined;

                return (
                  <div key={index} className="p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_140px_auto] sm:items-end">
                      <Field label="Product">
                        <select
                          className="input"
                          value={line.productId}
                          onChange={(e) => updateLine(index, { productId: e.target.value })}
                        >
                          <option value="">Select a product…</option>
                          {products.data?.data.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku}) — {p.currentStock} in stock
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Quantity">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className={cn('input', (line.exceedsStock || shortfall) && 'border-red-400')}
                          value={line.quantity}
                          onChange={(e) => updateLine(index, { quantity: e.target.value })}
                        />
                      </Field>

                      <div className="text-sm sm:pb-2 sm:text-right">
                        <p className="text-xs text-slate-500">Line total</p>
                        <p className="font-medium tabular-nums text-slate-900">
                          {formatCurrency(line.lineTotal)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        disabled={lines.length === 1}
                        className="mb-1 rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Remove line"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {line.product && (
                      <p className="mt-1.5 text-xs text-slate-500">
                        {formatCurrency(line.product.unitPrice)} each ·{' '}
                        <span className={cn(line.exceedsStock && 'font-medium text-red-600')}>
                          {line.product.currentStock} in stock
                        </span>
                      </p>
                    )}

                    {shortfall && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
                        <AlertTriangle size={13} />
                        Rejected by the server: asked for {shortfall.requested}, only {shortfall.available}{' '}
                        available — short by {shortfall.shortBy}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-4">
            <Field label="Notes">
              <textarea
                className="input min-h-[70px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery instructions, transport details…"
              />
            </Field>
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:col-span-1">
          <div className="card sticky top-20 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Summary</h2>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Lines</dt>
                <dd className="tabular-nums text-slate-800">{validLines.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Total units</dt>
                <dd className="tabular-nums text-slate-800">{totalQuantity}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <dt className="font-medium text-slate-900">Total value</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{formatCurrency(totalAmount)}</dd>
              </div>
            </dl>

            {anyExceeds && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  At least one line exceeds available stock. You can still save this as a draft — confirming
                  it will be rejected until stock is topped up.
                </span>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="btn-primary w-full"
                disabled={!canSubmit || mutation.isPending}
                onClick={() => mutation.mutate(true)}
              >
                {mutation.isPending && <Spinner />}
                Save &amp; confirm
              </button>
              <button
                type="button"
                className="btn-secondary w-full"
                disabled={!canSubmit || mutation.isPending}
                onClick={() => mutation.mutate(false)}
              >
                Save as draft
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Confirming deducts stock and writes an OUT movement per line, all in one transaction. If any
              line is short, nothing is deducted at all.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
