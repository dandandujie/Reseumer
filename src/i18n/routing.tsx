/**
 * Compatibility layer: provides the same Link, useRouter, usePathname exports
 * as the original next-intl/navigation-based routing.ts so that the 18+ files
 * importing from '@/i18n/routing' need minimal changes.
 */
import React from 'react';
import {
  Link as RouterLink,
  useNavigate,
  useLocation,
  useParams,
  type LinkProps as RouterLinkProps,
} from 'react-router-dom';
import { locales, defaultLocale, type Locale } from './config';
import i18n from './index';

export const routing = { locales, defaultLocale };

// Locale-aware Link that prepends /:locale to the href
type LocaleLinkProps = Omit<RouterLinkProps, 'to'> & {
  href: string;
  locale?: Locale;
};

export function Link({ href, locale, ...props }: LocaleLinkProps) {
  const params = useParams<{ locale: string }>();
  const currentLocale = locale || params.locale || i18n.language || defaultLocale;
  const to = href.startsWith('/') ? `/${currentLocale}${href}` : href;
  return React.createElement(RouterLink, { ...props, to });
}

export function usePathname(): string {
  const { pathname } = useLocation();
  // Strip locale prefix to match next-intl behavior
  for (const loc of locales) {
    if (pathname.startsWith(`/${loc}/`)) {
      return pathname.slice(loc.length + 1);
    }
    if (pathname === `/${loc}`) {
      return '/';
    }
  }
  return pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  const params = useParams<{ locale: string }>();
  const locale = params.locale || i18n.language || defaultLocale;

  return {
    push(path: string) {
      const to = path.startsWith('/') ? `/${locale}${path}` : path;
      navigate(to);
    },
    replace(path: string) {
      const to = path.startsWith('/') ? `/${locale}${path}` : path;
      navigate(to, { replace: true });
    },
    back() {
      navigate(-1);
    },
  };
}

export function redirect(path: string) {
  // Client-side redirect — used only in event handlers, not during render
  window.location.href = path;
}

export function getPathname(opts: { locale: string; href: string }) {
  return `/${opts.locale}${opts.href}`;
}
