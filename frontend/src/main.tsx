import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import { AppRoutes } from '@/routes/AppRoutes';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The database is in another region, so refetching on every window focus
      // makes the UI feel busier than it is without adding information.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found in index.html');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { fontSize: '14px' },
            success: { iconTheme: { primary: '#059669', secondary: 'white' } },
            error: { duration: 6000, iconTheme: { primary: '#dc2626', secondary: 'white' } },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
