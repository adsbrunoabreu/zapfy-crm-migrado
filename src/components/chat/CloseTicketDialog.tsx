import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { useCloseTicket, type AttendanceTicket } from '@/hooks/useAttendanceTickets';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: AttendanceTicket;
}

export default function CloseTicketDialog({ open, onOpenChange, ticket }: Props) {
  const { data: settings } = useAttendanceSettings();
  const close = useCloseTicket();
  const reasons: string[] = ((settings?.closing as any)?.reasons || []) as string[];
  const ratingEnabled = !!(settings?.rating as any)?.enabled;
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [skipRating, setSkipRating] = useState(false);

  useEffect(() => {
    if (open && reasons.length > 0 && !reason) setReason(reasons[0]);
  }, [open, reasons, reason]);

  useEffect(() => {
    if (open) setSkipRating(false);
  }, [open]);

  const handleSubmit = async () => {
    if (!reason) return;
    await close.mutateAsync({ ticket_id: ticket.id, reason, notes: notes.trim() || undefined, skipRating });
    setNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Encerrar ticket {ticket.ticket_code}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
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
              placeholder="Detalhes do encerramento"
              rows={3}
            />
          </div>

          {ratingEnabled && (
            <label className="flex items-start gap-2 cursor-pointer select-none rounded-md border border-border/50 bg-muted/20 px-3 py-2">
              <Checkbox
                checked={skipRating}
                onCheckedChange={(v) => setSkipRating(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground/90 leading-snug">
                Não enviar pesquisa de avaliação para este atendimento
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!reason || close.isPending}>
            {close.isPending ? 'Encerrando...' : 'Encerrar ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
