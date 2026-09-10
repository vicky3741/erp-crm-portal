import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '@/api/endpoints';
import { getApiErrorMessage, getApiFieldErrors } from '@/api/client';
import { Field, Modal, Spinner } from '@/components/ui';
import type { Product } from '@/types/api';

interface FormState {
  name: string;
  sku: string;
  category: string;
  unitPrice: string;
  openingStock: string;
  minStockAlert: string;
  location: string;
}

const EMPTY: FormState = {
  name: '',
  sku: '',
  category: '',
  unitPrice: '',
  openingStock: '0',
  minStockAlert: '0',
  location: '',
};

export function ProductFormModal({
  open,
  onClose,
  product,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product | null;
  categories: string[];
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(product);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    setForm(
      product
        ? {
            name: product.name,
            sku: product.sku,
            category: product.category,
            unitPrice: String(product.unitPrice),
            openingStock: '0',
            minStockAlert: String(product.minStockAlert),
            location: product.location,
          }
        : EMPTY,
    );
  }, [open, product]);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      isEdit && product ? productsApi.update(product.id, payload) : productsApi.create(payload),
    onSuccess: (saved) => {
      toast.success(isEdit ? 'Product updated' : `${saved.name} added`);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      onClose();
    },
    onError: (error) => {
      const errors = getApiFieldErrors(error);
      if (errors.length) setFieldErrors(Object.fromEntries(errors.map((e) => [e.field, e.message])));
      toast.error(getApiErrorMessage(error, 'Could not save the product'));
    },
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    // currentStock is deliberately not sent: stock only ever changes through a
    // movement, so an edit form must not be able to set it.
    const payload: Record<string, unknown> = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      unitPrice: Number(form.unitPrice),
      minStockAlert: Number(form.minStockAlert),
      location: form.location,
      ...(isEdit ? {} : { openingStock: Number(form.openingStock) }),
    };

    mutation.mutate(payload);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit product' : 'Add product'}
      description={
        isEdit
          ? 'Stock is not editable here — use "Adjust stock" so the change is recorded in the ledger.'
          : 'Opening stock is recorded as an IN movement, not written straight into the column.'
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button type="submit" form="product-form" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {isEdit ? 'Save changes' : 'Add product'}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Field label="Product name" required error={fieldErrors.name}>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </Field>
        </div>

        <Field label="SKU" required error={fieldErrors.sku} hint="Letters, numbers, hyphens. Stored uppercase.">
          <input
            className="input font-mono uppercase"
            value={form.sku}
            onChange={(e) => set('sku', e.target.value.toUpperCase())}
            placeholder="GRO-OIL-1L"
            required
          />
        </Field>

        <Field label="Category" required error={fieldErrors.category}>
          <input
            className="input"
            list="product-categories"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            required
          />
          <datalist id="product-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field label="Unit price (₹)" required error={fieldErrors.unitPrice} hint="Up to 2 decimal places">
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={form.unitPrice}
            onChange={(e) => set('unitPrice', e.target.value)}
            required
          />
        </Field>

        <Field
          label="Low-stock alert at"
          required
          error={fieldErrors.minStockAlert}
          hint="Flagged when stock reaches this level"
        >
          <input
            type="number"
            min="0"
            className="input"
            value={form.minStockAlert}
            onChange={(e) => set('minStockAlert', e.target.value)}
            required
          />
        </Field>

        {!isEdit && (
          <Field label="Opening stock" error={fieldErrors.openingStock} hint="Recorded as an IN movement">
            <input
              type="number"
              min="0"
              className="input"
              value={form.openingStock}
              onChange={(e) => set('openingStock', e.target.value)}
            />
          </Field>
        )}

        <div className={isEdit ? 'sm:col-span-2' : ''}>
          <Field label="Location" required error={fieldErrors.location}>
            <input
              className="input"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Warehouse A - Rack 1"
              required
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
