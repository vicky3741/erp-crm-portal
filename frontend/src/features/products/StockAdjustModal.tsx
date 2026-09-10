import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { productsApi } from '@/api/endpoints';
import { getApiErrorMessage, getInsufficientStock } from '@/api/client';
import { Field, Modal, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { MovementType, Product } from '@/types/api';

const QUICK_REASONS: Record<MovementType, string[]> = {
  IN: ['Goods received from supplier', 'Stock count correction', 'Customer return'],
  OUT: ['Damaged in transit', 'Stock count correction', 'Sample issued'],
};

export function StockAdjustModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: Product | null;
}) {
  const queryClient = useQueryClient();

  const [movementType, setMovementType] = useState<MovementType>('IN');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [shortfall, setShortfall] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMovementType('IN');
      setQuantity('');
      setReason('');
      setShortfall(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      productsApi.adjustStock(product!.id, {
        quantity: Number(quantity),
        movementType,
        reason,
      }),
    onSuccess: (response) => {
      toast.success(response.message ?? 'Stock updated');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
    onError: (error) => {
      // The API returns a machine-readable shortfall; show it in place rather
      // than making the user work it out from a generic message.
      const insufficient = getInsufficientStock(error);
      if (insufficient?.[0]) {
        const s = insufficient[0];
        setShortfall(`You asked for ${s.requested} but only ${s.available} are in stock — short by ${s.shortBy}.`);
      }
      toast.error(getApiErrorMessage(error, 'Could not adjust stock'));
    },
  });

  if (!product) return null;

  const qty = Number(quantity);
  const projected =
    Number.isFinite(qty) && qty > 0
      ? movementType === 'IN'
        ? product.currentStock + qty
        : product.currentStock - qty
      : product.currentStock;

  const wouldGoNegative = projected < 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    setShortfall(null);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('Enter a whole number greater than zero');
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Give a reason of at least 3 characters');
      return;
    }
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust stock"
      description={`${product.name} · ${product.sku}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button
            type="submit"
            form="stock-form"
            className="btn-primary"
            disabled={mutation.isPending || wouldGoNegative}
          >
            {mutation.isPending && <Spinner />}
            Record movement
          </button>
        </>
      }
    >
      <form id="stock-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
          <span className="text-slate-500">Current stock</span>
          <span className="ml-2 font-semibold tabular-nums text-slate-900">{product.currentStock}</span>
        </div>

        <Field label="Direction" required>
          <div className="grid grid-cols-2 gap-2">
            {(['IN', 'OUT'] as MovementType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setMovementType(type);
                  setShortfall(null);
                }}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  movementType === type
                    ? type === 'IN'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-red-300 bg-red-50 text-red-700'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {type === 'IN' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                Stock {type}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Quantity" required>
          <input
            type="number"
            min="1"
            step="1"
            className="input"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setShortfall(null);
            }}
            required
          />
        </Field>

        {quantity && (
          <div
            className={cn(
              'rounded-lg px-3 py-2.5 text-sm',
              wouldGoNegative ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700',
            )}
          >
            New balance would be{' '}
            <span className="font-semibold tabular-nums">{projected}</span>
            {wouldGoNegative && ' — stock cannot go below zero, so the server will reject this.'}
          </div>
        )}

        <Field label="Reason" required hint="Required — an unexplained stock change is useless in an audit">
          <input
            className="input"
            list="stock-reasons"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <datalist id="stock-reasons">
            {QUICK_REASONS[movementType].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>

        {shortfall && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {shortfall}
          </div>
        )}
      </form>
    </Modal>
  );
}
