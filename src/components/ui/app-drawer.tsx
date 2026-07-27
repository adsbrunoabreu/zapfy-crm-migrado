import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * AppDrawer — drawer padronizado do sistema.
 *
 * Padroniza:
 *  - Largura: `w-full sm:max-w-xl` (≈576px)
 *  - Altura total: `h-[100dvh]`
 *  - Layout: flex-col, sem padding externo (header/body controlam)
 *  - Tema: tokens semânticos (`bg-background`, `border-border`, `text-foreground`)
 *  - Body com `ScrollArea` (rolagem vertical) e padding consistente (`px-5 py-5`)
 *
 * Uso:
 * ```tsx
 * <AppDrawer
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Detalhes"
 *   description="Edite as informações abaixo"
 *   icon={<Pencil className="w-4 h-4" />}
 *   footer={<Button>Salvar</Button>}
 * >
 *   <FormContent />
 * </AppDrawer>
 * ```
 *
 * Para casos avançados (tabs, header customizado), use `<AppDrawerShell>`.
 */
export interface AppDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'right' | 'left';
  /** Desabilita o ScrollArea interno (use quando o filho gerencia seu próprio scroll) */
  noScroll?: boolean;
  /** Classe extra para o body (área entre header e footer) */
  bodyClassName?: string;
  /** Classe extra para o SheetContent */
  className?: string;
}

export function AppDrawer({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  side = 'right',
  noScroll = false,
  bodyClassName,
  className,
}: AppDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <AppDrawerShell side={side} className={className}>
        <AppDrawerHeader title={title} description={description} icon={icon} />
        {noScroll ? (
          <div className={cn('flex-1 min-h-0 overflow-hidden', bodyClassName)}>
            {children}
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className={cn('px-5 py-5', bodyClassName)}>{children}</div>
          </ScrollArea>
        )}
        {footer && <AppDrawerFooter>{footer}</AppDrawerFooter>}
      </AppDrawerShell>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks (para casos com tabs / layouts customizados)        */
/* ------------------------------------------------------------------ */

export interface AppDrawerShellProps {
  children: React.ReactNode;
  side?: 'right' | 'left';
  className?: string;
}

/** Container do drawer com largura/altura/tema padronizados. */
export function AppDrawerShell({
  children,
  side = 'right',
  className,
}: AppDrawerShellProps) {
  return (
    <SheetContent
      side={side}
      className={cn(
        'w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col',
        'bg-background border-l border-border',
        side === 'left' && 'border-l-0 border-r border-border',
        className,
      )}
    >
      {children}
    </SheetContent>
  );
}

export interface AppDrawerHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Conteúdo extra à direita (ex.: badges, ações) */
  actions?: React.ReactNode;
  className?: string;
}

export function AppDrawerHeader({
  title,
  description,
  icon,
  actions,
  className,
}: AppDrawerHeaderProps) {
  return (
    <SheetHeader
      className={cn(
        'px-5 pt-5 pb-4 border-b border-border shrink-0 space-y-0',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="w-9 h-9 rounded-md bg-card border border-border flex items-center justify-center text-muted-foreground shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-base text-foreground truncate">
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground mt-0.5">
              {description}
            </SheetDescription>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </SheetHeader>
  );
}

export function AppDrawerFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'px-5 py-3 border-t border-border shrink-0 flex items-center justify-end gap-2 bg-background',
        className,
      )}
    >
      {children}
    </div>
  );
}
