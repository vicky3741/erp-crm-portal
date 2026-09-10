import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { customersApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CustomerFormModal } from '@/features/customers/CustomerFormModal';
import {
  ChallanStatusBadge,
  ErrorState,
  Field,
  Modal,
  PageLoader,
  Spinner,
  StatusBadge,
  TypeBadge,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@/components/ui';

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const canWrite = can('ADMIN', 'SALES');
  const canDelete = can('ADMIN');

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  const query = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: () => customersApi.get(id),
    enabled: Boolean(id),
  });

  const addFollowUp = useMutation({
    mutationFn: () => customersApi.addFollowUp(id, { note, followUpDate: followUpDate || null }),
    onSuccess: () => {
      toast.success('Follow-up added');
      setNote('');
      setFollowUpDate('');
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Could not add the note')),
  });

  const deactivate = useMutation({
    mutationFn: () => customersApi.deactivate(id),
    onSuccess: () => {
      toast.success('Customer deactivated');
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      setDeleteOpen(false);
      navigate('/customers');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Could not deactivate')),
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) {
    return <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const customer = query.data;
  if (!customer) return null;

  function submitNote(e: FormEvent) {
    e.preventDefault();
    if (note.trim().length < 3) {
      toast.error('Write at least a few words');
      return;
    }
    addFollowUp.mutate();
  }

  return (
    <>
      <Link
        to="/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Back to customers
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{customer.businessName}</h1>
            <StatusBadge status={customer.status} />
            <TypeBadge type={customer.customerType} />
            {!customer.isActive && <span className="badge bg-red-100 text-red-700">Deactivated</span>}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {customer.name} · {customer.mobile} · {customer.email}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <button type="button" className="btn-secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={15} />
              Edit
            </button>
          )}
          {canDelete && customer.isActive && (
            <button type="button" className="btn-danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={15} />
              Deactivate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Details */}
        <section className="card p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Details</h2>
          <dl className="space-y-3 text-sm">
            {[
              ['GST number', customer.gstNumber ?? '—'],
              ['Address', customer.address],
              ['Next follow-up', formatDate(customer.followUpDate)],
              ['Added by', `${customer.createdBy.name} (${customer.createdBy.role})`],
              ['Added on', formatDate(customer.createdAt)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-0.5 text-slate-800">{value}</dd>
              </div>
            ))}
            {customer.notes && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Notes</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{customer.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Follow-ups */}
        <section className="card lg:col-span-2">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Follow-up history
              <span className="ml-2 font-normal text-slate-400">{customer.followUps.length}</span>
            </h2>
          </div>

          {canWrite && (
            <form onSubmit={submitNote} className="border-b border-slate-200 bg-slate-50 p-4">
              <Field label="Add a note">
                <textarea
                  className="input min-h-[68px]"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Called about the new price list…"
                />
              </Field>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="w-44">
                  <Field label="Next follow-up" hint="Optional — also updates the customer">
                    <input
                      type="date"
                      className="input"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                    />
                  </Field>
                </div>
                <button type="submit" className="btn-primary" disabled={addFollowUp.isPending}>
                  {addFollowUp.isPending ? <Spinner /> : <Plus size={16} />}
                  Add note
                </button>
              </div>
            </form>
          )}

          {customer.followUps.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No follow-ups recorded yet.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {customer.followUps.map((f) => (
                <li key={f.id} className="px-4 py-3">
                  <p className="text-sm text-slate-800">{f.note}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {f.createdBy.name} ({f.createdBy.role}) · {formatDateTime(f.createdAt)}
                    {f.followUpDate && <> · next: {formatDate(f.followUpDate)}</>}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Challans */}
      <section className="card mt-4">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Recent challans</h2>
        </div>

        {customer.challans.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            No challans raised for this customer.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Number</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Units</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 text-right font-medium">Raised</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customer.challans.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-900">
                      {c.challanNumber}
                    </td>
                    <td className="px-4 py-2.5">
                      <ChallanStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {c.totalQuantity}
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
        )}
      </section>

      <CustomerFormModal open={editOpen} onClose={() => setEditOpen(false)} customer={customer} />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Deactivate this customer?"
        description="Nothing is deleted."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => deactivate.mutate()}
              disabled={deactivate.isPending}
            >
              {deactivate.isPending && <Spinner />}
              Deactivate
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-900">{customer.businessName}</span> will be hidden from
          the customer list, but every challan and follow-up note raised against them stays intact and
          readable. An admin can reactivate them later.
        </p>
      </Modal>
    </>
  );
}
