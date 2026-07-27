import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  tabs?: ReactNode;
  children: ReactNode;
  /** 'screen-2xl' (default) | 'full' */
  maxWidth?: 'screen-2xl' | 'full';
  /** Render only children inside the scroll container (no header, no padding). For Chat-like full-bleed pages. */
  bare?: boolean;
  /** Extra className on the inner content wrapper */
  contentClassName?: string;
  /** Hide the header entirely but keep padding */
  hideHeader?: boolean;
}

/**
 * Padrão de layout para todas as páginas internas:
 * - Header sticky no topo (título, subtítulo, ações)
 * - Linha opcional de tabs/filtros logo abaixo
 * - Conteúdo com padding e largura máximas constantes
 *
 * Usar em cada página em vez de wrappers ad-hoc (`p-6 lg:p-8 space-y-6` etc.).
 */
export function PageShell({
  title,
  subtitle,
  icon,
  actions,
  filters,
  tabs,
  children,
  maxWidth = 'full',
  bare = false,
  contentClassName,
  hideHeader = false,
}: PageShellProps) {
  if (bare) {
    return <div className="h-full overflow-hidden">{children}</div>;
  }

  const widthCls = maxWidth === 'full' ? 'w-full' : 'max-w-screen-2xl mx-auto';

  return (
    <div className="h-full overflow-auto">
      {!hideHeader && (
        <header className="sticky top-0 z-30 bg-crm-column-header backdrop-blur-sm border-b border-border/30">
          <div className={cn(widthCls, 'pl-14 md:pl-6 lg:pl-8 pr-6 lg:pr-8 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3')}>
            <div className="min-w-0">
              {title && (
                <h1 className="text-xl font-semibold text-foreground leading-tight truncate">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap shrink-0">{actions}</div>
            )}
          </div>
          {(tabs || filters) && (
            <div className="border-t border-border/30">
              <div
                className={cn(
                  widthCls,
                  'px-6 lg:px-8 py-2 flex items-center gap-3 flex-wrap'
                )}
              >
                {tabs}
                {filters}
              </div>
            </div>
          )}
        </header>
      )}
      <div className={cn(widthCls, 'px-6 lg:px-8 py-6 space-y-6', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
