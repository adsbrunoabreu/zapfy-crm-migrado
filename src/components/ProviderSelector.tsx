/**
 * ProviderSelector
 * ----------------
 * Modal de escolha entre os provedores de WhatsApp suportados.
 * Refatorado para estética Vercel/Supabase: cards verticais com
 * destaques de benefícios em grid, badges de posicionamento e
 * tabela comparativa minimalista no rodapé.
 *
 * A camada de lógica (handlers, navegação, callbacks) foi preservada.
 */
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Cloud,
  Coins,
  Server,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ProviderType } from '@/types/providers';

/** Permite o terceiro fluxo (coexistência) sem poluir o tipo público de providers. */
type ProviderChoice = ProviderType | 'cloud_api_coexistence';

interface ProviderSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback quando o usuário escolhe um provider. Default: navega para /setup/{provider}. */
  onSelect?: (provider: ProviderType) => void;
}

/* ---------------------------------------------------------------- */
/*  COPY centralizada — ajustar textos sem mexer na estrutura       */
/* ---------------------------------------------------------------- */

type BenefitTone = 'success' | 'info' | 'warning' | 'muted';

interface Benefit {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone: BenefitTone;
}

interface ProviderCopy {
  type: ProviderChoice;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { label: string; variant: 'default' | 'secondary' | 'outline' | 'success' | 'warning' };
  description: string;
  benefits: Benefit[];
  cta: string;
  disabled?: boolean;
  disabledCta?: string;
}

const PROVIDERS: ProviderCopy[] = [
  {
    type: 'cloud_api',
    title: 'WhatsApp Cloud API',
    subtitle: 'Meta · oficial',
    icon: Cloud,
    badge: { label: 'Recomendado', variant: 'success' },
    description: 'Integração direta com a Meta. Máxima estabilidade, templates e botões nativos.',
    benefits: [
      { icon: ShieldCheck, label: 'API oficial Meta', tone: 'success' },
      { icon: ShieldCheck, label: 'Sem risco de banimento', tone: 'success' },
      { icon: Sparkles, label: 'Templates e botões nativos', tone: 'info' },
      { icon: Coins, label: 'Custo por conversa (Meta)', tone: 'muted' },
    ],
    cta: 'Configurar Cloud API',
  },
  {
    type: 'cloud_api_coexistence',
    title: 'Cloud API + Coexistência',
    subtitle: 'Meta oficial · mantém o app Business',
    icon: Smartphone,
    badge: { label: 'Em breve', variant: 'secondary' },
    description: 'Continue usando o WhatsApp Business no celular enquanto o CRM sincroniza tudo.',
    benefits: [
      { icon: Smartphone, label: 'Mantém o app no celular', tone: 'info' },
      { icon: Sparkles, label: 'Importa 6 meses de histórico', tone: 'info' },
      { icon: ShieldCheck, label: 'Echo das mensagens enviadas', tone: 'success' },
      { icon: ShieldAlert, label: 'Limite de 20 msgs/seg', tone: 'warning' },
    ],
    cta: 'Configurar Coexistência',
    disabled: true,
    disabledCta: 'Em breve',
  },
  {
    type: 'evolution',
    title: 'Evolution API',
    subtitle: 'WhatsApp Web não-oficial',
    icon: Server,
    badge: { label: 'Alternativo', variant: 'secondary' },
    description: 'Conexão via QR Code, custo fixo. Bom para começar rápido em escala pequena.',
    benefits: [
      { icon: Zap, label: 'Setup em ~5 minutos', tone: 'info' },
      { icon: Wallet, label: 'Custo fixo por servidor', tone: 'success' },
      { icon: ShieldAlert, label: 'Risco de banimento', tone: 'warning' },
      { icon: Sparkles, label: 'Botões com limitações', tone: 'muted' },
    ],
    cta: 'Configurar Evolution',
  },
];

const TONE_CLASSES: Record<BenefitTone, string> = {
  success: 'text-emerald-500',
  info: 'text-sky-500',
  warning: 'text-amber-500',
  muted: 'text-muted-foreground',
};

/* ---------------------------------------------------------------- */
/*  Card                                                            */
/* ---------------------------------------------------------------- */

function ProviderCard({ copy, onSelect }: { copy: ProviderCopy; onSelect: () => void }) {
  const { icon: Icon, badge } = copy;
  const isDisabled = !!copy.disabled;
  return (
    <div
      role={isDisabled ? undefined : 'button'}
      tabIndex={isDisabled ? -1 : 0}
      onClick={isDisabled ? undefined : onSelect}
      onKeyDown={
        isDisabled
          ? undefined
          : (e) => (e.key === 'Enter' || e.key === ' ') && onSelect()
      }
      data-provider={copy.type}
      className={cn(
        'group relative flex flex-col gap-4 rounded-lg border border-border bg-card p-5',
        !isDisabled &&
          'cursor-pointer transition-colors duration-150 hover:bg-accent/40 hover:border-foreground/30',
        isDisabled && 'opacity-60',
        !isDisabled && 'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{copy.title}</div>
            <div className="text-xs text-muted-foreground">{copy.subtitle}</div>
          </div>
        </div>
        {badge && (
          <Badge
            variant={badge.variant}
            className="text-[10px] font-medium uppercase tracking-wider"
          >
            {badge.label}
          </Badge>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{copy.description}</p>

      {/* Benefícios em grid 2 colunas */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {copy.benefits.map((b) => {
          const BIcon = b.icon;
          return (
            <div key={b.label} className="flex items-center gap-2 text-xs text-foreground/80">
              <BIcon className={cn('h-3.5 w-3.5 shrink-0', TONE_CLASSES[b.tone])} />
              <span className="truncate">{b.label}</span>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div className="mt-auto flex justify-end border-t border-border pt-4">
        <Button
          size="sm"
          variant={isDisabled ? 'outline' : 'default'}
          disabled={isDisabled}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {isDisabled ? copy.disabledCta ?? copy.cta : copy.cta}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Modal                                                           */
/* ---------------------------------------------------------------- */

export function ProviderSelector({ open, onOpenChange, onSelect }: ProviderSelectorProps) {
  const navigate = useNavigate();

  const handleSelect = (provider: ProviderChoice) => {
    onOpenChange(false);
    if (onSelect && (provider === 'evolution' || provider === 'cloud_api')) {
      onSelect(provider);
      return;
    }
    navigate(`/setup/${provider}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Conectar WhatsApp</DialogTitle>
          <DialogDescription>
            Escolha qual tecnologia será usada para enviar e receber mensagens neste número.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 -mx-1 px-1">
        {/* Cards empilhados verticalmente */}
        <div className="flex flex-col gap-3">
          {PROVIDERS.map((copy) => (
            <ProviderCard key={copy.type} copy={copy} onSelect={() => handleSelect(copy.type)} />
          ))}
        </div>

        {/* Comparação rápida */}
        <div className="mt-2 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-muted/30 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Comparação rápida
          </div>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium">Critério</th>
                <th className="px-3 py-2 text-left font-medium">Cloud API</th>
                <th className="px-3 py-2 text-left font-medium">Coexistência</th>
                <th className="px-3 py-2 text-left font-medium">Evolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground/80">
              <tr>
                <td className="px-3 py-2 font-medium">Custo</td>
                <td className="px-3 py-2 text-muted-foreground">Por conversa</td>
                <td className="px-3 py-2 text-muted-foreground">Por conversa</td>
                <td className="px-3 py-2 text-muted-foreground">Fixo (servidor)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Estabilidade</td>
                <td className="px-3 py-2 text-emerald-500">Alta</td>
                <td className="px-3 py-2 text-emerald-500">Alta</td>
                <td className="px-3 py-2 text-amber-500">Média</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Setup</td>
                <td className="px-3 py-2 text-muted-foreground">Verificação Meta</td>
                <td className="px-3 py-2 text-muted-foreground">Embedded Signup</td>
                <td className="px-3 py-2 text-muted-foreground">QR Code (5 min)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Banimento</td>
                <td className="px-3 py-2 text-emerald-500">Sem risco</td>
                <td className="px-3 py-2 text-emerald-500">Sem risco</td>
                <td className="px-3 py-2 text-amber-500">Possível</td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ProviderSelector;
