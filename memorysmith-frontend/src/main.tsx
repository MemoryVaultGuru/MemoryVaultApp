import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './app/query-client';
import { router } from './app/router';
import { configureHttp } from './shared/api/http';
import { endExpiredSession } from './app/session-expiry';
import { apiOrigin } from './shared/api/source';
import { authConfig } from './shared/auth/session';
import './i18n';
import './styles.css';

// With VITE_API_ORIGIN set the SPA talks to the real backend; without it, it
// reads the bundled seed and is a navigable prototype.
if (apiOrigin) {
  configureHttp({
    origin: apiOrigin,
    auth: authConfig(),
    onUnauthenticated: endExpiredSession,
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('missing #root element');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
