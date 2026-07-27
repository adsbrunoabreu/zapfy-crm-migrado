import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Database, RefreshCw, Sparkles, Trash2, Loader2 } from 'lucide-react';

type Mode = 'wipe' | 'seed' | 'reseed';

const MODE_META: Record<Mode, { title: string; desc: string; icon: React.ElementType; variant: 'destructive' | 'default' | 'outline' }> = {
  wipe: {
    title: 'Limpar dados',
    desc: 'Remove leads, conversas, mensagens, tickets, agendamentos e metas. Preserva pipelines, etapas, instâncias e equipe.',
    icon: Trash2,
    variant: 'destructive',
  },
  seed: {
    title: 'Semear dados demo',
    desc: 'Gera dados de demonstração distribuídos pelos últimos N dias.',
    icon: Sparkles,
    variant: 'outline',
  },
  reseed: {
    title: 'Resetar e semear',
    desc: 'Limpa tudo e gera dados novos numa única operação.',
    icon: RefreshCw,
    variant: 'default',
  },
};

interface Props {
  companyId: string;
  companyName: string;
}

export function DemoDataPanel({ companyId, companyName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null);
  const [days, setDays] = useState(30);
  const [password, setPassword] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const closeDialog = () => {
    setMode(null);
    setPassword('');
    setConfirmName('');
  };

  const handleRun = async () => {
    if (!mode) return;
    if (confirmName.trim() !== companyName.trim()) {
      toast({ title: 'Confirmação inválida', description: 'Digite o nome exato da empresa.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-demo-data', {
        body: { company_id: companyId, mode, days, password },
      });
      if (error) {
        const ctx = (error as any).context;
        const msg = ctx?.error || error.message || 'Falha na operação';
        toast({ title: 'Erro', description: msg, variant: 'destructive' });
        return;
      }
      setLastResult(data);
      toast({ title: 'Sucesso', description: `${MODE_META[mode].title} concluído.` });
      qc.invalidateQueries();
      closeDialog();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-4 space-y-4 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-start gap-2">
        <Database className="w-4 h-4 mt-0.5 text-amber-500" />
        <div>
          <p className="text-sm font-medium">Dados demo (Master)</p>
          <p className="text-xs text-muted-foreground">
            Gerencie dados de demonstração desta empresa. Operações exigem confirmação por senha.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Período da geração: <span className="font-mono">{days} dias</span></Label>
        <Slider min={7} max={90} step={1} value={[days]} onValueChange={(v) => setDays(v[0])} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(['wipe', 'seed', 'reseed'] as Mode[]).map((m) => {
          const meta = MODE_META[m];
          const Icon = meta.icon;
          return (
            <Button key={m} variant={meta.variant} size="sm" onClick={() => setMode(m)} className="text-xs">
              <Icon className="w-3.5 h-3.5 mr-1.5" />
              {meta.title}
            </Button>
          );
        })}
      </div>

      {lastResult && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Último resultado</summary>
          <pre className="mt-2 p-2 bg-background rounded border overflow-auto max-h-48">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        </details>
      )}

      <AlertDialog open={mode !== null} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mode ? MODE_META[mode].title : ''} — {companyName}</AlertDialogTitle>
            <AlertDialogDescription>{mode ? MODE_META[mode].desc : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          {mode && mode !== 'wipe' && (
            <p className="text-xs text-muted-foreground">
              Dados serão gerados cobrindo os últimos <strong>{days} dias</strong> e o dia atual.
            </p>
          )}
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Digite o nome da empresa para confirmar</Label>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={companyName} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sua senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleRun(); }} disabled={submitting || !password || !confirmName}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
