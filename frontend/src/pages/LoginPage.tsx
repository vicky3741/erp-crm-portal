import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Boxes, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/api/client';
import { Field, PageLoader, Spinner } from '@/components/ui';
import type { Role } from '@/types/api';

/**
 * Demo accounts are listed on the login screen deliberately: this is an
 * assessment build, and a reviewer should be able to switch roles in one click
 * rather than hunting through a README.
 */
const DEMO_ACCOUNTS: Array<{ role: Role; email: string; password: string; blurb: string }> = [
  { role: 'ADMIN', email: 'admin@erp.local', password: 'Admin@123', blurb: 'Full access' },
  { role: 'SALES', email: 'sales@erp.local', password: 'Sales@123', blurb: 'Customers, challans' },
  { role: 'WAREHOUSE', email: 'warehouse@erp.local', password: 'Warehouse@123', blurb: 'Stock, dispatch' },
  { role: 'ACCOUNTS', email: 'accounts@erp.local', password: 'Accounts@123', blurb: 'Read-only' },
];

export default function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@erp.local');
  const [password, setPassword] = useState('Admin@123');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageLoader label="Checking your session…" />;
  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not sign in'));
    } finally {
      setSubmitting(false);
    }
  }

  function useAccount(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card md:grid md:grid-cols-[1.1fr_1fr]">
        {/* Form */}
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Boxes size={19} />
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-900">
                ERP <span className="text-slate-400">+</span> CRM Operations Portal
              </h1>
              <p className="text-xs text-slate-500">Wholesale &amp; distribution</p>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
          <p className="mb-5 mt-0.5 text-sm text-slate-500">Use one of the demo accounts to continue.</p>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Email" required>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </Field>

            <Field label="Password" required>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting && <Spinner />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Demo accounts */}
        <div className="border-t border-slate-200 bg-slate-50 p-6 sm:p-8 md:border-l md:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts</p>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            Each role sees a different menu and is allowed different actions.
          </p>

          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.role}
                type="button"
                onClick={() => useAccount(account)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-900">{account.role}</span>
                  <span className="block text-xs text-slate-500">{account.blurb}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">Use</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
