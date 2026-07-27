import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FormFooterProps {
  /** Texto do botão de confirmação. Default: "Salvar" */
  confirmLabel?: string;
  /** Texto durante loading. Default: "Salvando..." */
  loadingLabel?: string;
  /** Texto do botão de cancelar. Default: "Cancelar" */
  cancelLabel?: string;
  /** Variante do botão de confirmar. */
  confirmVariant?: 'default' | 'destructive';
  /** Disabled state do confirm */
  disabled?: boolean;
  /** Loading state do confirm */
  loading?: boolean;
  /** Tipo do botão de confirmar (default 'submit' p/ uso em <form>) */
  confirmType?: 'button' | 'submit';
  /** Click do confirmar (use quando NÃO estiver dentro de <form>) */
  onConfirm?: () => void;
  /** Click do cancelar */
  onCancel?: () => void;
  /** Conteúdo extra à esquerda (ex: link auxiliar) */
  extra?: ReactNode;
  className?: string;
}

/**
 * Footer padronizado para forms em Dialog/Sheet/página.
 * Layout: [cancelar | extra] ........ [confirmar]
 */
export function FormFooter({
  confirmLabel = 'Salvar',
  loadingLabel = 'Salvando...',
  cancelLabel = 'Cancelar',
  confirmVariant = 'default',
  disabled,
  loading,
  confirmType = 'submit',
  onConfirm,
  onCancel,
  extra,
  className,
}: FormFooterProps) {
  return (
    <div className={cn('flex items-center justify-between gap-2 pt-2', className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={loading}
        >
          {cancelLabel}
        </Button>
        {extra}
      </div>
      <Button
        type={confirmType}
        variant={confirmVariant}
        onClick={onConfirm}
        disabled={disabled || loading}
      >
        {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
        {loading ? loadingLabel : confirmLabel}
      </Button>
    </div>
  );
}
