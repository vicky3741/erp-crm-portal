import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { PageLoader } from '@/components/ui';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import CustomersPage from '@/pages/CustomersPage';
import CustomerDetailPage from '@/pages/CustomerDetailPage';
import ProductsPage from '@/pages/ProductsPage';
import StockLedgerPage from '@/pages/StockLedgerPage';
import ChallansPage from '@/pages/ChallansPage';
import ChallanCreatePage from '@/pages/ChallanCreatePage';
import ChallanDetailPage from '@/pages/ChallanDetailPage';

/** Blocks a route until there is an authenticated user. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="card p-10 text-center">
      <p className="text-lg font-semibold text-slate-900">Page not found</p>
      <p className="mt-1 text-sm text-slate-500">That page does not exist.</p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />

        <Route path="/products" element={<ProductsPage />} />
        <Route path="/stock" element={<StockLedgerPage />} />

        <Route path="/challans" element={<ChallansPage />} />
        {/* Declared before "/challans/:id" so "new" is not read as an id. */}
        <Route path="/challans/new" element={<ChallanCreatePage />} />
        <Route path="/challans/:id" element={<ChallanDetailPage />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
