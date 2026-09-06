import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../shared/components/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage';
import { GuidancePanel } from '../features/guidance/GuidancePanel';
import { FolderRoute } from '../features/structure/FolderRoute';
import { ResumeReading } from '../features/structure/ResumeReading';
import { TemplatesPage } from '../features/structure/TemplatesPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { GraphPage } from '../features/graph/GraphPage';
import { VaultLayout } from '../features/structure/VaultLayout';
import { RequireSession, RootLayout } from './RootLayout';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      {
        element: <RequireSession />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <DashboardPage /> },
              {
                path: '/vaults/:vaultSlug',
                element: <VaultLayout />,
                children: [
                  { index: true, element: <ResumeReading /> },
                  { path: 'guidance', element: <GuidancePanel /> },
                  { path: 'templates', element: <TemplatesPage /> },
                  { path: 'graph', element: <GraphPage /> },
                  { path: 'root/*', element: <FolderRoute /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
