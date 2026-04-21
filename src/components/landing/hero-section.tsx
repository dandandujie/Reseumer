import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function HeroSection() {
  const t = useTranslations('landing.hero');

  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 pt-16 sm:px-6 lg:px-8">
      {/* Background effects */}
      <div
        className="absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full opacity-20 blur-[100px] dark:opacity-10"
        style={{ background: 'radial-gradient(circle, #ec4899, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full opacity-15 blur-[100px] dark:opacity-10"
        style={{ background: 'radial-gradient(circle, #f472b6, transparent 70%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle, #71717a 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <Badge
          variant="secondary"
          className="mb-6 border-brand-muted bg-brand-muted px-4 py-1.5 text-sm text-brand dark:border-brand-muted dark:bg-brand-muted dark:text-brand"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          AI-Powered
        </Badge>

        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          <span className="bg-gradient-to-r from-zinc-900 via-zinc-700 to-brand bg-clip-text text-transparent dark:from-zinc-100 dark:via-zinc-300 dark:to-brand-hover">
            {t('title')}
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg md:text-xl dark:text-zinc-400">
          {t('subtitle')}
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            asChild
            className="h-12 w-full cursor-pointer rounded-xl bg-brand px-8 text-base font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-xl hover:shadow-brand/30 sm:h-11 sm:w-auto sm:px-6 sm:text-sm"
          >
            <Link href="/dashboard">{t('cta')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
