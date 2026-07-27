import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAttendanceSettings } from '@/hooks/useAttendanceSettings';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  pending: boolean;
  progress?: { done: number; total: number } | null;
  onConfirm: (input: { reason: string; notes?: string; skipRating: boolean }) => void;
}

export default function BulkCloseTicketsDialog({
  open,
  onOpenChange,
  count,
  pending,
  progress,
  onConfirm,
}: Props) {
  const { data: settings } = useAttendanceSettings();
  const reasons: string[] = ((settings?.closing as any)?.reasons || []) as string[];
  const ratingEnabled = !!(settings?.rating as any)?.enabled;
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [skipRating, setSkipRating] = useState(false);

  useEffect(() => {
    if (open) {
      setNotes('');
      setSkipRating(false);
      if (reasons.length > 0) setReason((prev) => prev || reasons[0]);
    }
  }, [open, reasons]);

  const handleSubmit = () => {
    if (!reason) return;
    onConfirm({ reason, notes: notes.trim() || undefined, skipRating });
  };

  const isEmpty = count === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEmpty ? 'Nenhuma conversa aberta' : `Encerrar ${count} conversa${count !== 1 ? 's' : ''}`}
          </DialogTitle>
          <DialogDescription>
            {isEmpty
              ? 'Nenhuma das conversas selecionadas está em atendimento aberto.'
              : 'Esta ação encerra as conversas selecionadas que ainda estão abertas. Tickets ativos serão finalizados e conversas abertas sem ticket também sairão da lista em aberto.'}
          </DialogDescription>
        </DialogHeader>

        {!isEmpty && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo</Label>
              <Select value={reason} onValueChange={setReason} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observação (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes do encerramento (aplicado a todos)"
                rows={3}
                disabled={pending}
              />
            </div>

            {ratingEnabled && (
              <label className="flex items-start gap-2 cursor-pointer select-none rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                <Checkbox
                  checked={skipRating}
                  onCheckedChange={(v) => setSkipRating(v === true)}
                  disabled={pending}
                  className="mt-0.5"
                />
                <span className="text-xs text-foreground/90 leading-snug">
                  Não enviar pesquisa de avaliação para estes atendimentos
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {isEmpty ? 'Fechar' : 'Cancelar'}
          </Button>
          {!isEmpty && (
            <Button onClick={handleSubmit} disabled={!reason || pending}>
              {pending
                ? progress
                  ? `Encerrando ${progress.done}/${progress.total}…`
                  : 'Encerrando…'
                : `Encerrar ${count} conversa${count !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
