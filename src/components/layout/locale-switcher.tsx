'use client';

import { useLocale } from 'next-intl';
import { useNavigate, useLocation } from 'react-router-dom';
import i18n from '@/i18n';
import { locales, localeNames } from '@/i18n/config';
import { Globe } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function LocaleSwitcher() {
  const locale = useLocale();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function onValueChange(newLocale: string) {
    i18n.changeLanguage(newLocale);
    // Rewrite locale segment in pathname
    const parts = pathname.split('/');
    if (parts.length > 1 && locales.includes(parts[1] as any)) {
      parts[1] = newLocale;
      navigate(parts.join('/'), { replace: true });
    } else {
      navigate(`/${newLocale}${pathname}`, { replace: true });
    }
  }

  return (
    <Select value={locale} onValueChange={onValueChange}>
      <SelectTrigger className="w-auto gap-1.5 border-none bg-transparent px-2 text-sm shadow-none">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((loc) => (
          <SelectItem key={loc} value={loc}>
            {localeNames[loc]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
