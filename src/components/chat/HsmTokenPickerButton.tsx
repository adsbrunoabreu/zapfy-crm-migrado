/**
 * Pequeno botão "+ token" exibido ao lado de um input de variável HSM.
 * Permite inserir tokens do sistema (ex.: {{primeiro_nome}}) no campo.
 */
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TEMPLATE_VARIABLES } from '@/components/templates/templateVariables';

interface Props {
  onInsert: (token: string) => void;
  disabled?: boolean;
}

export function HsmTokenPickerButton({ onInsert, disabled }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          disabled={disabled}
          title="Inserir variável do sistema"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[220px] p-1">
        <div className="text-[10px] uppercase text-muted-foreground px-2 py-1">
          Variáveis do sistema
        </div>
        <ul className="max-h-[260px] overflow-y-auto">
          {TEMPLATE_VARIABLES.map((v) => (
            <li key={v.key}>
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-secondary"
                onClick={() => onInsert(`{{${v.key}}}`)}
              >
                <div className="font-mono">{`{{${v.key}}}`}</div>
                <div className="text-[10px] text-muted-foreground">{v.label}</div>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
