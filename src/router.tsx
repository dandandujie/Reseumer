import { Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import i18n from '@/i18n';

// Layouts
import { Header } from '@/components/layout/header';

// Pages (lazy imports not needed for desktop app)
import { LandingPage } from '@/components/landing/landing-page';
import DashboardPage from '@/pages/dashboard';
import EditorPage from '@/pages/editor';
import PreviewPage from '@/pages/preview';

function LocaleProvider() {
  const { locale } = useParams<{ locale: string }>();

  useEffect(() => {
    if (locale && locale !== i18n.language) {
      i18n.changeLanguage(locale);
    }
  }, [locale]);

  return <Outlet />;
}

function DashboardLayout() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-background">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function EditorLayout() {
  return (
    <div className="h-screen overflow-hidden bg-zinc-50">
      <Outlet />
    </div>
  );
}

export function AppRouter() {
  return (
    <Routes>
      {/* Default redirect to dashboard */}
      <Route path="/" element={<Navigate to="/zh/dashboard" replace />} />

      {/* Locale-scoped routes */}
      <Route path="/:locale" element={<LocaleProvider />}>
        {/* Landing page */}
        <Route index element={<LandingPage />} />

        {/* Dashboard */}
        <Route element={<DashboardLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
        </Route>

        {/* Editor */}
        <Route element={<EditorLayout />}>
          <Route path="editor/:id" element={<EditorPage />} />
        </Route>

        {/* Preview */}
        <Route path="preview/:id" element={<PreviewPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/zh/dashboard" replace />} />
    </Routes>
  );
}
