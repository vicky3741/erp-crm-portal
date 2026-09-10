import { useEffect, type ReactNode } from 'react';
import { Loader2, X, ChevronLeft, ChevronRight, Inbox, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ChallanStatus, CustomerStatus, CustomerType, MovementType, Role } from '@/types/api';

// ------------------------------- feedback -----------------------------------

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} size={18} />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500">
      <Spinner className="h-6 w-6" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Inbox size={20} />
      </span>
      <p className="font-medium text-slate-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-500">
        <AlertTriangle size={20} />
      </span>
      <p className="font-medium text-slate-900">Something went wrong</p>
      <p className="max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// -------------------------------- badges ------------------------------------

const customerStatusStyles: Record<CustomerStatus, string> = {
  LEAD: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  INACTIVE: 'bg-slate-200 text-slate-600',
};

const customerTypeStyles: Record<CustomerType, string> = {
  RETAIL: 'bg-sky-100 text-sky-800',
  WHOLESALE: 'bg-violet-100 text-violet-800',
  DISTRIBUTOR: 'bg-indigo-100 text-indigo-800',
};

const challanStatusStyles: Record<ChallanStatus, string> = {
  DRAFT: 'bg-slate-200 text-slate-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

const roleStyles: Record<Role, string> = {
  ADMIN: 'bg-brand-100 text-brand-800',
  SALES: 'bg-emerald-100 text-emerald-800',
  WAREHOUSE: 'bg-amber-100 text-amber-800',
  ACCOUNTS: 'bg-violet-100 text-violet-800',
};

export function StatusBadge({ status }: { status: CustomerStatus }) {
  return <span className={cn('badge', customerStatusStyles[status])}>{status}</span>;
}

export function TypeBadge({ type }: { type: CustomerType }) {
  return <span className={cn('badge', customerTypeStyles[type])}>{type}</span>;
}

export function ChallanStatusBadge({ status }: { status: ChallanStatus }) {
  return <span className={cn('badge', challanStatusStyles[status])}>{status}</span>;
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={cn('badge', roleStyles[role])}>{role}</span>;
}

export function MovementBadge({ type }: { type: MovementType }) {
  return (
    <span
      className={cn('badge', type === 'IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}
    >
      {type}
    </span>
  );
}

export function LowStockBadge() {
  return <span className="badge bg-red-100 text-red-700">Low stock</span>;
}

// -------------------------------- modal -------------------------------------

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  // Escape closes, and the page behind must not scroll while a modal is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('card relative z-10 w-full', widths[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------ pagination ----------------------------------

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}) {
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
      <p className="text-sm text-slate-500">
        Showing <span className="font-medium text-slate-700">{first}</span>–
        <span className="font-medium text-slate-700">{last}</span> of{' '}
        <span className="font-medium text-slate-700">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary px-2 py-1.5"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm text-slate-600">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          className="btn-secondary px-2 py-1.5"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// -------------------------------- fields ------------------------------------

export function Field({
  label,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  icon?: ReactNode;
}) {
  const tones = {
    default: 'text-slate-900',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    success: 'text-emerald-600',
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-500">{label}</p>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tones[tone])}>{value}</p>
    </div>
  );
}

/** Formats a Decimal-as-string from the API as Indian rupees. */
export function formatCurrency(value: string | number) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
