import { useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding, useUpdateOnboarding, useMarkOnboardingStepDone, type OnboardingStepKey } from '@/hooks/useOnboarding';
import { useInstances } from '@/hooks/useInstances';
import { usePipelines, useCreatePipeline, useCreateStage } from '@/hooks/usePipelines';
import { useCreateInvite } from '@/hooks/useTeamInvites';
import { useUserCompany, useUpdateCompany } from '@/hooks/useCompanies';
import { useCompanySubscription } from '@/hooks/useSubscriptions';
import { Building2, MessageCircle, KanbanSquare, Users, Check, ArrowRight, Loader2, Zap, X, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { NewInstanceQrFlow } from './NewInstanceQrFlow';
import { ChoosePlanGrid } from '@/components/subscription/ChoosePlanGrid';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: { key: OnboardingStepKey | 'done'; title: string; icon: any }[] = [
  { key: 'company', title: 'Empresa', icon: Building2 },
  { key: 'whatsapp', title: 'WhatsApp', icon: MessageCircle },
  { key: 'pipeline', title: 'Pipeline', icon: KanbanSquare },
  { key: 'team', title: 'Equipe', icon: Users },
  { key: 'plan', title: 'Plano', icon: CreditCard },
  { key: 'done', title: 'Concluir', icon: Check },
];

export function OnboardingWizard({ open, onOpenChange }: Props) {
  const { data: state } = useOnboarding();
  const update = useUpdateOnboarding();
  const markDone = useMarkOnboardingStepDone();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stepIndex, setStepIndex] = useState(() => Math.max(0, (state?.current_step ?? 1) - 1));

  const completed = useMemo(() => new Set(state?.completed_steps ?? []), [state]);

  const goNext = async () => {
    const next = Math.min(stepIndex + 1, STEPS.length - 1);
    setStepIndex(next);
    await update.mutateAsync({ current_step: next + 1 });
  };

  const skip = async () => {
    await goNext();
  };

  const finish = async () => {
    await update.mutateAsync({ completed_at: new Date().toISOString(), current_step: STEPS.length });
    onOpenChange(false);
    navigate('/chat');
  };

  const current = STEPS[stepIndex];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary fill-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Bem-vindo ao zapfy · Teste grátis de 1 dia</p>
            <h2 className="font-display text-lg font-bold truncate">Vamos configurar sua conta em 5 passos</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="border-b border-border bg-background/50 px-6 py-3 flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => {
            const SIcon = s.icon;
            const isCurrent = i === stepIndex;
            const isDone = s.key !== 'done' && completed.has(s.key);
            return (
              <div key={s.key} className="flex items-center gap-1 flex-shrink-0">
                <div
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs',
                    isCurrent && 'bg-primary/15 text-primary border border-primary/30',
                    !isCurrent && isDone && 'text-foreground',
                    !isCurrent && !isDone && 'text-muted-foreground'
                  )}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : <SIcon className="w-3.5 h-3.5" />}
                  <span className="font-medium">{s.title}</span>
                </div>
                {i < STEPS.length - 1 && <div className="w-4 h-px bg-border" />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8 min-h-[320px]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-display text-2xl font-bold">{current.title}</h3>
          </div>

          {current.key === 'company' && <StepCompany onDone={async () => { await markDone.mutateAsync('company'); await goNext(); }} />}
          {current.key === 'whatsapp' && <StepWhatsapp onDone={async () => { await markDone.mutateAsync('whatsapp'); await goNext(); }} onSkip={skip} />}
          {current.key === 'pipeline' && <StepPipeline onDone={async () => { await markDone.mutateAsync('pipeline'); await goNext(); }} onSkip={skip} />}
          {current.key === 'team' && <StepTeam onDone={async () => { await markDone.mutateAsync('team'); await goNext(); }} onSkip={skip} />}
          {current.key === 'plan' && <StepPlan onDone={async () => { await markDone.mutateAsync('plan'); await goNext(); }} onSkip={skip} />}
          {current.key === 'done' && <StepDone onFinish={finish} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ====================================================
// Step 1: Empresa — form completo
// ====================================================
function StepCompany({ onDone }: { onDone: () => void }) {
  const { data: company, isLoading } = useUserCompany();
  const updateCompany = useUpdateCompany();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (company && !hydrated) {
      setName(company.name || '');
      setCnpj(company.cnpj || '');
      setPhone(company.phone || '');
      setEmail(company.email || '');
      setHydrated(true);
    }
  }, [company, hydrated]);

  const handleSave = async () => {
    if (!company?.id) return;
    if (!name.trim()) {
      toast({ title: 'Informe o nome da empresa', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateCompany.mutateAsync({
        id: company.id,
        name: name.trim(),
        cnpj: cnpj.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      } as any);
      toast({ title: 'Empresa atualizada' });
      await onDone();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Confirme os dados da sua empresa. Você pode editar tudo depois em Configurações.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nome da empresa *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sua Empresa LTDA" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label>CNPJ</Label>
          <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" maxLength={20} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" maxLength={20} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>E-mail de contato</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@suaempresa.com" maxLength={120} />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Salvar e continuar <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ====================================================
// Step 2: WhatsApp
// ====================================================
function StepWhatsapp({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { data: instances = [], refetch } = useInstances();
  const hasInstance = instances.length > 0;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Conecte seu WhatsApp para começar a receber e responder conversas dentro do zapfy.
      </p>

      {hasInstance ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium">WhatsApp conectado</p>
            <p className="text-xs text-muted-foreground">
              {instances.length} {instances.length === 1 ? 'instância configurada' : 'instâncias configuradas'}
            </p>
          </div>
        </div>
      ) : (
        <NewInstanceQrFlow onConnected={() => { refetch(); }} />
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onSkip}>Pular por enquanto</Button>
        <Button onClick={onDone} disabled={!hasInstance}>
          {hasInstance ? <>Próximo <ArrowRight className="w-4 h-4 ml-2" /></> : 'Conecte para continuar'}
        </Button>
      </div>
    </div>
  );
}

// ====================================================
// Step 5: Plano
// ====================================================
function StepPlan({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { profile } = useAuth();
  const { data: subscription } = useCompanySubscription(profile?.company_id);
  const isActive = subscription?.status === 'active';

  // Auto-avança se já houver assinatura ativa
  useEffect(() => {
    if (isActive) {
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Seu teste grátis dura apenas <strong className="text-foreground">1 dia</strong>. Já deixe seu plano ativo agora pra não perder acesso —
        você pode pular e decidir depois em <strong>Assinatura</strong>.
      </p>

      <ChoosePlanGrid
        title="Escolha seu plano"
        subtitle="Pague com cartão ou Pix sem sair do onboarding."
      />

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onSkip}>Pular — escolho depois</Button>
        <Button onClick={onDone} variant="outline">
          Já assinei, continuar <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ====================================================
// Step 3: Pipeline
// ====================================================
const DEFAULT_STAGES = [
  { name: 'Novo', color: '#84cc16' },
  { name: 'Em contato', color: '#3b82f6' },
  { name: 'Negociação', color: '#a855f7' },
  { name: 'Ganho', color: '#22c55e' },
  { name: 'Perdido', color: '#ef4444' },
];

function StepPipeline({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const { data: pipelines = [] } = usePipelines();
  const realPipelines = pipelines.filter((p: any) => !String(p.id).startsWith('mock-'));
  const createPipeline = useCreatePipeline();
  const createStage = useCreateStage();
  const [name, setName] = useState('Pipeline de Vendas');
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const hasPipeline = realPipelines.length > 0;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const pipeline = await createPipeline.mutateAsync({ name });
      await Promise.all(
        DEFAULT_STAGES.map((s, i) =>
          createStage.mutateAsync({ ...s, position: i, pipeline_id: pipeline.id })
        )
      );
      toast({ title: 'Pipeline criado', description: `${DEFAULT_STAGES.length} etapas adicionadas.` });
      await onDone();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Vamos criar seu primeiro pipeline de vendas com as etapas mais usadas. Você pode customizar tudo depois.
      </p>

      {hasPipeline ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-primary" />
          <div>
            <p className="font-medium">Pipeline criado</p>
            <p className="text-xs text-muted-foreground">{realPipelines.length} pipeline(s) ativo(s)</p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Nome do pipeline</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Vendas, Atendimento" />
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Etapas que serão criadas</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DEFAULT_STAGES.map((s) => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border"
                  style={{ borderColor: s.color + '60', color: s.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onSkip}>Pular por enquanto</Button>
        {hasPipeline ? (
          <Button onClick={onDone}>Próximo <ArrowRight className="w-4 h-4 ml-2" /></Button>
        ) : (
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Criar pipeline
          </Button>
        )}
      </div>
    </div>
  );
}

// ====================================================
// Step 4: Equipe
// ====================================================
function StepTeam({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [emails, setEmails] = useState('');
  const createInvite = useCreateInvite();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const list = emails
      .split(/[,\s\n]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (list.length === 0) {
      toast({ title: 'Adicione ao menos um e-mail válido', variant: 'destructive' });
      return;
    }
    setSending(true);
    let ok = 0;
    for (const email of list) {
      try {
        await createInvite.mutateAsync({ email, role: 'agente' });
        ok++;
      } catch {
        // continue
      }
    }
    setSending(false);
    toast({ title: `${ok} de ${list.length} convite(s) enviado(s)` });
    await onDone();
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Convide os atendentes que vão trabalhar com você. Eles receberão acesso ao se cadastrar com o e-mail convidado.
      </p>
      <div className="space-y-1.5">
        <Label>E-mails (separados por vírgula ou linha)</Label>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={4}
          placeholder="atendente1@suaempresa.com, atendente2@suaempresa.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={onSkip}>Pular — convido depois</Button>
        <Button onClick={handleSend} disabled={sending || !emails.trim()}>
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Enviar convites
        </Button>
      </div>
    </div>
  );
}

// ====================================================
// Step 5: Done
// ====================================================
function StepDone({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="space-y-6 text-center py-8">
      <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
        <Check className="w-8 h-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="font-display text-2xl font-bold">Tudo pronto!</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Sua conta está configurada. Vamos abrir o chat para você começar a vender no zap.
        </p>
      </div>
      <Button size="lg" onClick={onFinish}>
        Ir para o chat <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}
