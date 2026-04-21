'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BrandSwitcher } from '@/components/layout/brand-switcher';
import * as api from '@/lib/tauri-api';
import { useFingerprint } from '@/hooks/use-fingerprint';

interface UserInfo {
  name?: string;
  avatarUrl?: string;
}

export function UserMenu() {
  const { fingerprint } = useFingerprint();
  const [user, setUser] = useState<UserInfo | null>(null);
  useTranslations('auth');

  useEffect(() => {
    if (!fingerprint) return;
    api.getUser().then((u) => {
      if (u) setUser({ name: u.name, avatarUrl: u.avatarUrl });
    }).catch(() => { /* ignore */ });
  }, [fingerprint]);

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-zinc-400">
        <Avatar className="h-8 w-8">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || ''} />}
          <AvatarFallback className="bg-zinc-200 text-zinc-600 text-xs">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5 text-sm">
          <p className="font-medium text-zinc-900">{user.name || 'User'}</p>
        </div>
        <DropdownMenuSeparator />
        <BrandSwitcher />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
