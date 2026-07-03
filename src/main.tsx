import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/fraunces';
import i18n from '@/i18n';
import { AppRouter } from '@/router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <AppRouter />
          <Toaster />
        </TooltipProvider>
      </I18nextProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
