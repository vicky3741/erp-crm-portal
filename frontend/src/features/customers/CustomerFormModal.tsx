import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '@/api/endpoints';
import { getApiErrorMessage, getApiFieldErrors } from '@/api/client';
import { Field, Modal, Spinner } from '@/components/ui';
import type { Customer, CustomerStatus, CustomerType } from '@/types/api';

interface FormState {
  name: string;
  mobile: string;
  email: string;
  businessName: string;
  gstNumber: string;
  customerType: CustomerType;
  address: string;
  status: CustomerStatus;
  followUpDate: string;
  notes: string;
}

const EMPTY: FormState = {
  name: '',
  mobile: '',
  email: '',
  businessName: '',
  gstNumber: '',
  customerType: 'RETAIL',
  address: '',
  status: 'LEAD',
  followUpDate: '',
  notes: '',
};

function toFormState(customer: Customer & { notes?: string | null }): FormState {
  return {
    name: customer.name,
    mobile: customer.mobile,
    email: customer.email,
    businessName: customer.businessName,
    gstNumber: customer.gstNumber ?? '',
    customerType: customer.customerType,
    address: customer.address,
    status: customer.status,
    followUpDate: customer.followUpDate ? customer.followUpDate.slice(0, 10) : '',
    notes: customer.notes ?? '',
  };
}

export function CustomerFormModal({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  /** Present for edit, absent for create. */
  customer?: (Customer & { notes?: string | null }) | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(customer);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(customer ? toFormState(customer) : EMPTY);
      setFieldErrors({});
    }
  }, [open, customer]);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      isEdit && customer ? customersApi.update(customer.id, payload) : customersApi.create(payload),
    onSuccess: (saved) => {
      toast.success(isEdit ? 'Customer updated' : `${saved.name} added`);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (error) => {
      // Map the API's per-field messages back onto the inputs that caused them.
      const errors = getApiFieldErrors(error);
      if (errors.length) {
        setFieldErrors(Object.fromEntries(errors.map((e) => [e.field, e.message])));
      }
      toast.error(getApiErrorMessage(error, 'Could not save the customer'));
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

    // Empty optional fields are sent as null so the API clears them, rather
    // than as "" which would fail validation.
    const payload: Record<string, unknown> = {
      name: form.name,
      mobile: form.mobile,
      email: form.email,
      businessName: form.businessName,
      gstNumber: form.gstNumber.trim() || null,
      customerType: form.customerType,
      address: form.address,
      status: form.status,
      followUpDate: form.followUpDate || null,
      notes: form.notes.trim() || null,
    };

    mutation.mutate(payload);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit customer' : 'Add customer'}
      description={
        isEdit ? 'Only the fields you change are sent to the server.' : 'Mobile number must be unique.'
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </button>
          <button type="submit" form="customer-form" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner />}
            {isEdit ? 'Save changes' : 'Add customer'}
          </button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Contact name" required error={fieldErrors.name}>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>

        <Field label="Business name" required error={fieldErrors.businessName}>
          <input
            className="input"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            required
          />
        </Field>

        <Field
          label="Mobile"
          required
          error={fieldErrors.mobile}
          hint="10 digits, starting 6-9"
        >
          <input
            className="input"
            inputMode="numeric"
            value={form.mobile}
            onChange={(e) => set('mobile', e.target.value)}
            required
          />
        </Field>

        <Field label="Email" required error={fieldErrors.email}>
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            required
          />
        </Field>

        <Field label="Customer type" required error={fieldErrors.customerType}>
          <select
            className="input"
            value={form.customerType}
            onChange={(e) => set('customerType', e.target.value as CustomerType)}
          >
            <option value="RETAIL">Retail</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="DISTRIBUTOR">Distributor</option>
          </select>
        </Field>

        <Field label="Status" required error={fieldErrors.status}>
          <select
            className="input"
            value={form.status}
            onChange={(e) => set('status', e.target.value as CustomerStatus)}
          >
            <option value="LEAD">Lead</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>

        <Field label="GST number" error={fieldErrors.gstNumber} hint="Optional, 15 characters">
          <input
            className="input font-mono uppercase"
            value={form.gstNumber}
            onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
            placeholder="27AABCP1234C1ZV"
          />
        </Field>

        <Field label="Next follow-up" error={fieldErrors.followUpDate}>
          <input
            type="date"
            className="input"
            value={form.followUpDate}
            onChange={(e) => set('followUpDate', e.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Address" required error={fieldErrors.address}>
            <textarea
              className="input min-h-[72px]"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Notes" error={fieldErrors.notes}>
            <textarea
              className="input min-h-[72px]"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Payment terms, delivery preferences…"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
