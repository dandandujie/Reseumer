import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { APP_NAME } from '@/lib/constants';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const appName = process.env.APP_NAME || APP_NAME;

export const metadata: Metadata = {
  title: `${appName} - AI Resume Builder`,
  description: 'AI-powered intelligent resume builder with drag-and-drop editor',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key='reseumer-brand';var legacy='jadeai-brand';var b=localStorage.getItem(key)||localStorage.getItem(legacy);if(b==='boss'){b='mint';}else if(b==='jade'){b='blue';}if(b==='mint'||b==='blue'||b==='pink'){localStorage.setItem(key,b);if(localStorage.getItem(legacy)!==null){localStorage.removeItem(legacy);}if(b==='blue'||b==='pink'){document.documentElement.setAttribute('data-brand',b);}}}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
