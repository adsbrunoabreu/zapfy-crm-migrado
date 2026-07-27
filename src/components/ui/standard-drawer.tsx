import * as React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * StandardDrawer
 * ----------------------------------------------------------------------------
 * Wrapper padrão para todos os drawers do app (Agendamentos, Chat, Leads, etc.).
 *
 * Layout garantido:
 *   SheetContent  → h-[100dvh] flex flex-col p-0 overflow-hidden
 *   <Header>      → shrink-0 (não rola)
 *   <Body>        → flex-1 min-h-0 overflow-y-auto overscroll-contain
 *   <Footer>      → shrink-0 (sticky no rodapé)
 *
 * Uso:
 *   <StandardDrawer
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Título"
 *     description="Subtítulo opcional"
 *     icon={<Icon />}
 *     footer={<Buttons />}
 *   >
 *     {body}
 *   </StandardDrawer>
 */

type Side = 'right' | 'left' | 'top' | 'bottom';
type Width = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const WIDTH_MAP: Record<Width, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
};

interface StandardDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  side?: Side;
  width?: Width;
  contentClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  /** Padding interno do body (default px-5 py-5). */
  bodyPadding?: string;
}

export function StandardDrawer({
  open,
  onOpenChange,
  title,
  description,
  icon,
  footer,
  children,
  side = 'right',
  width = 'xl',
  contentClassName,
  bodyClassName,
  headerClassName,
  footerClassName,
  bodyPadding = 'px-5 py-5',
}: StandardDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          'w-full h-[100dvh] overflow-hidden p-0 flex flex-col bg-background border-l border-border',
          WIDTH_MAP[width],
          contentClassName,
        )}
      >
        <SheetHeader className={cn('px-5 pt-5 pb-4 border-b border-border shrink-0', headerClassName)}>
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-10 h-10 rounded-md bg-card border border-border flex items-center justify-center shrink-0 text-muted-foreground">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1 text-left">
              <SheetTitle className="text-base truncate">{title}</SheetTitle>
              {description && (
                <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </SheetDescription>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain', bodyPadding, bodyClassName)}>
          {children}
        </div>

        {footer && (
          <div
            className={cn(
              'border-t border-border bg-background/95 backdrop-blur px-5 py-3 shrink-0',
              footerClassName,
            )}
          >
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default StandardDrawer;
