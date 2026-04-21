import Image from 'next/image';
import { APP_NAME } from '@/lib/constants';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  textClassName?: string;
  iconSize?: number;
  priority?: boolean;
};

export function BrandLogo({
  className,
  textClassName,
  iconSize = 28,
  priority = false,
}: BrandLogoProps) {
  return (
    <div className={cn('inline-flex items-center gap-2 select-none', className)}>
      <Image
        src="/logo-icon.svg"
        alt={APP_NAME}
        width={iconSize}
        height={iconSize}
        priority={priority}
        className="shrink-0"
      />
      <span
        className={cn(
          'text-base font-semibold tracking-[0.18em] text-zinc-950 dark:text-zinc-50',
          textClassName
        )}
      >
        {APP_NAME}
      </span>
    </div>
  );
}
