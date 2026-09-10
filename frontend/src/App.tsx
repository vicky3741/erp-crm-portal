import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { apiClient, getApiErrorMessage, type ApiResponse } from '@/api/client';

interface HealthPayload {
  status: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

type Status =
  | { kind: 'loading' }
  | { kind: 'ok'; payload: HealthPayload }
  | { kind: 'error'; message: string };

/**
 * Scaffold landing screen (S0).
 * It exists to prove the toolchain end-to-end: React + Tailwind render, and the
 * frontend can reach the backend through the Vite proxy.
 * Replaced by the real router and app shell in S7.
 */
export default function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<ApiResponse<HealthPayload>>('/health')
      .then((res) => {
        if (!cancelled) setStatus({ kind: 'ok', payload: res.data.data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatus({ kind: 'error', message: getApiErrorMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-lg p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Activity size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">ERP + CRM Operations Portal</h1>
            <p className="text-sm text-slate-500">Scaffold ready — section S0 complete</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Backend connection
          </p>

          {status.kind === 'loading' && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 size={16} className="animate-spin" />
              Checking <code className="rounded bg-slate-200 px-1">/api/health</code>…
            </p>
          )}

          {status.kind === 'ok' && (
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <CheckCircle2 size={16} />
                Connected
              </p>
              <p className="text-slate-600">
                Environment: <span className="font-medium">{status.payload.environment}</span>
              </p>
              <p className="text-slate-600">
                Uptime: <span className="font-medium">{status.payload.uptimeSeconds}s</span>
              </p>
            </div>
          )}

          {status.kind === 'error' && (
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2 font-medium text-red-700">
                <XCircle size={16} />
                Not connected
              </p>
              <p className="text-slate-600">{status.message}</p>
              <p className="text-slate-500">
                Start it with <code className="rounded bg-slate-200 px-1">npm run dev</code> inside{' '}
                <code className="rounded bg-slate-200 px-1">backend/</code>.
              </p>
            </div>
          )}
        </div>

        <ol className="mt-6 space-y-1 text-sm text-slate-600">
          <li>Next: S1 — database schema and seed data</li>
        </ol>
      </div>
    </main>
  );
}
