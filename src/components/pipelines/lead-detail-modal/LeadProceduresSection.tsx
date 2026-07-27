import { Activity, Plus, X, Loader2, Minus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useMedicalProcedures } from '@/hooks/medical/useMedicalProcedures';
import { useMedical } from '@/contexts/MedicalContext';
import {
  useLeadProcedures,
  useAddLeadProcedure,
  useRemoveLeadProcedure,
  useUpdateProcedureQuantity,
  type LeadProcedure,
} from '@/hooks/useLeadProcedures';

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function LeadProceduresSection({ leadId, locked = false }: { leadId: string; locked?: boolean }) {
  const { currentPractice } = useMedical();
  const { data: procedures = [] } = useMedicalProcedures(currentPractice?.id ?? null);
  const { data: assigned = [], isLoading } = useLeadProcedures(leadId);
  const addP = useAddLeadProcedure();
  const removeP = useRemoveLeadProcedure();
  const updateQty = useUpdateProcedureQuantity();
  const [picker, setPicker] = useState<string>('');

  const totalUnits = assigned.reduce((acc, a) => acc + (Number(a.quantity) || 1), 0);
  const total = assigned.reduce(
    (acc, a) => acc + (Number(a.price_snapshot) || 0) * (Number(a.quantity) || 1),
    0,
  );

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Procedimentos
        </h4>
      </div>

      <div className="space-y-1.5">
        {isLoading && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && assigned.length === 0 && (
          <div className="text-xs text-muted-foreground/60 py-2 text-center">
            Nenhum procedimento atribuído
          </div>
        )}
        {assigned.map((a) => (
          <ProcedureRow
            key={a.id}
            item={a}
            locked={locked}
            onChangeQty={(qty) => updateQty.mutate({ id: a.id, leadId, quantity: qty })}
            onRemove={() => removeP.mutate({ id: a.id, leadId })}
          />
        ))}
      </div>

      {!locked && (
        <div className="flex gap-2">
          <SearchableSelect
            value={picker}
            onValueChange={setPicker}
            options={procedures.map((p) => ({
              value: p.id,
              label: p.name,
              hint: p.base_price != null ? fmtBRL(Number(p.base_price)) : undefined,
            }))}
            placeholder={procedures.length === 0 ? 'Sem procedimentos cadastrados' : 'Selecione um procedimento'}
            searchPlaceholder="Buscar procedimento..."
            emptyText="Nenhum procedimento encontrado."
            className="flex-1 border-border/60"
          />
          <Button
            type="button"
            size="sm"
            disabled={!picker || addP.isPending}
            onClick={() => {
              if (!picker) return;
              addP.mutate({ leadId, procedureId: picker }, { onSuccess: () => setPicker('') });
            }}
          >
            {addP.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      )}

      {assigned.length > 0 && (
        <>
          <div className="flex items-end justify-between border-t border-border/60 pt-3">
            <div className="text-xs text-muted-foreground">
              <span className="tabular-nums text-foreground font-medium">{assigned.length}</span>
              {assigned.length === 1 ? ' item' : ' itens'}
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              <span className="tabular-nums text-foreground font-medium">{totalUnits}</span>
              {totalUnits === 1 ? ' unidade' : ' unidades'}
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="text-lg font-semibold tabular-nums text-foreground leading-tight">
                {fmtBRL(total)}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-snug">
            O valor da oportunidade é somado automaticamente (preço × quantidade). Editar manualmente o
            campo "Valor" desativa o cálculo automático.
          </p>
        </>
      )}
    </section>
  );
}

function ProcedureRow({
  item,
  locked = false,
  onChangeQty,
  onRemove,
}: {
  item: LeadProcedure;
  locked?: boolean;
  onChangeQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const unit = Number(item.price_snapshot) || 0;
  const serverQty = Number(item.quantity) || 1;
  const [localQty, setLocalQty] = useState<number>(serverQty);
  const [draft, setDraft] = useState<string>(String(serverQty));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<number>(serverQty);

  // Sincroniza com o servidor quando não há edição pendente em voo
  useEffect(() => {
    if (timer.current) return; // ignora se há commit debounced em curso
    setLocalQty(serverQty);
    setDraft(String(serverQty));
    pendingRef.current = serverQty;
  }, [serverQty]);

  const scheduleCommit = (n: number) => {
    pendingRef.current = n;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (pendingRef.current !== serverQty) onChangeQty(pendingRef.current);
    }, 300);
  };

  const bump = (delta: number) => {
    const n = Math.max(1, Math.min(999, localQty + delta));
    setLocalQty(n);
    setDraft(String(n));
    scheduleCommit(n);
  };

  const commitFromInput = (raw: string) => {
    const n = Math.max(1, Math.min(999, Math.floor(Number(raw) || 1)));
    setLocalQty(n);
    setDraft(String(n));
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (n !== serverQty) onChangeQty(n);
  };

  const subtotal = unit * localQty;

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{item.procedure?.name ?? '—'}</div>
        <div className="text-[10px] font-mono text-muted-foreground">{fmtBRL(unit)} cada</div>
      </div>

      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={locked || localQty <= 1}
          onClick={() => bump(-1)}
          aria-label="Diminuir quantidade"
        >
          <Minus className="w-3 h-3" />
        </Button>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={(e) => commitFromInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          inputMode="numeric"
          disabled={locked}
          className="h-7 w-12 px-1 text-center text-xs tabular-nums"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={locked}
          onClick={() => bump(1)}
          aria-label="Aumentar quantidade"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      <div className="w-24 text-right text-sm font-medium tabular-nums">{fmtBRL(subtotal)}</div>

      {!locked && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remover procedimento"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
