import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Trophy, XCircle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLossReasons } from '@/hooks/useLossReasons';
import { useLeadOutcome } from '@/hooks/useLeadOutcome';
import { toast } from '@/hooks/use-toast';

type Mode = 'won' | 'lost';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  leadId: string | null;
  leadName?: string;
}

const lostSchema = z.object({
  reasonId: z.string().nullable(),
  reasonText: z.string().trim().max(200).optional(),
}).refine((d) => !!d.reasonId || (d.reasonText && d.reasonText.length >= 3), {
  message: 'Selecione um motivo ou descreva (mín. 3 caracteres)',
});

export function LeadOutcomeDialog({ open, onOpenChange, mode, leadId, leadName }: Props) {
  const { data: reasons } = useLossReasons({ onlyActive: true });
  const { markAsWon, markAsLost } = useLeadOutcome();
  const [reasonId, setReasonId] = useState<string>('');
  const [reasonText, setReasonText] = useState('');

  useEffect(() => {
    if (open) { setReasonId(''); setReasonText(''); }
  }, [open]);

  const isWon = mode === 'won';
  const pending = markAsWon.isPending || markAsLost.isPending;

  const handleConfirm = async () => {
    if (!leadId) return;
    if (isWon) {
      await markAsWon.mutateAsync(leadId);
      onOpenChange(false);
      return;
    }
    const useCustom = reasonId === '__custom__' || (!reasonId && reasonText);
    const parsed = lostSchema.safeParse({
      reasonId: useCustom ? null : (reasonId || null),
      reasonText: reasonText,
    });
    if (!parsed.success) {
      toast({ title: 'Motivo obrigatório', description: parsed.error.issues[0]?.message, variant: 'destructive' });
      return;
    }
    await markAsLost.mutateAsync({
      leadId,
      reasonId: useCustom ? null : (reasonId || null),
      reasonText: reasonText || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isWon
              ? <><Trophy className="w-5 h-5 text-emerald-500" /> Marcar como Ganho</>
              : <><XCircle className="w-5 h-5 text-destructive" /> Marcar como Perdido</>}
          </DialogTitle>
          <DialogDescription>
            {isWon
              ? <>Confirmar fechamento positivo {leadName ? <>de <b>{leadName}</b></> : 'do lead'}?</>
              : <>Selecione o motivo da perda {leadName ? <>de <b>{leadName}</b></> : ''}.</>}
          </DialogDescription>
        </DialogHeader>

        {!isWon && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo</Label>
              <Select value={reasonId} onValueChange={setReasonId}>
                <SelectTrigger><SelectValue placeholder="Selecione um motivo" /></SelectTrigger>
                <SelectContent>
                  {(reasons || []).map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">Outro (digitar abaixo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observação {reasonId === '__custom__' && <span className="text-destructive">*</span>}</Label>
              <Textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value.slice(0, 200))}
                placeholder={reasonId === '__custom__' ? 'Descreva o motivo...' : 'Detalhes adicionais (opcional)'}
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground text-right">{reasonText.length}/200</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={pending}
            className={isWon
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}
          >
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isWon ? 'Confirmar Ganho' : 'Confirmar Perda'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
