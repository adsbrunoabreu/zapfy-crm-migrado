/**
 * HsmTemplatePopover — botão + popover para escolher e enviar um template
 * oficial (HSM) da WhatsApp Cloud API. Disponível apenas em conversas
 * cuja instância seja `cloud_api`.
 *
 * Suporta variáveis do sistema (ex.: {{primeiro_nome}}) que são resolvidas
 * com dados do lead vinculado antes do envio. Mapping é salvo por template.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  useHsmTemplates,
  useSendHsmTemplate,
  useSyncHsmTemplates,
  extractVariables,
  renderTemplateText,
  type HsmTemplate,
} from '@/hooks/useHsmTemplates';
import {
  useHsmTemplateVarMapping,
  useSaveHsmVarMapping,
} from '@/hooks/useHsmTemplateVarMapping';
import {
  resolveSystemTokens,
  suggestDefaultTokens,
  type LeadContext,
} from './hsmTokenResolver';
import { HsmTokenPickerButton } from './HsmTokenPickerButton';

interface Props {
  instanceId: string;
  conversationId: string;
  disabled?: boolean;
  onSent?: () => void;
  /** Hook chamado antes do envio. Se retornar false, aborta. */
  onBeforeSend?: () => Promise<boolean>;
}

function useLeadContext(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['hsm-lead-context', conversationId],
    enabled: !!conversationId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<LeadContext | null> => {
      if (!conversationId) return null;
      const { data: conv } = await supabase
        .from('conversations')
        .select('lead_id, contact_name, phone')
        .eq('id', conversationId)
        .maybeSingle();
      if (!conv?.lead_id) {
        return {
          name: conv?.contact_name ?? null,
          phone: conv?.phone ?? null,
        };
      }
      const { data: lead } = await supabase
        .from('leads')
        .select('name, phone, email, value, company_name, city, state, assigned_to, stage_id')
        .eq('id', conv.lead_id)
        .maybeSingle();
      if (!lead) return null;

      let assigned_to_name: string | null = null;
      if (lead.assigned_to) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', lead.assigned_to)
          .maybeSingle();
        assigned_to_name = prof?.full_name ?? null;
      }
      let stage: string | null = null;
      if (lead.stage_id) {
        const { data: st } = await (supabase as any)
          .from('pipeline_stages')
          .select('name')
          .eq('id', lead.stage_id)
          .maybeSingle();
        stage = st?.name ?? null;
      }

      return {
        name: lead.name,
        company: (lead as any).company_name ?? null,
        phone: lead.phone,
        email: lead.email,
        value: lead.value,
        city: lead.city,
        state: lead.state,
        assigned_to_name,
        stage,
      };
    },
  });
}

export function HsmTemplatePopover({ instanceId, conversationId, disabled, onSent, onBeforeSend }: Props) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? '';

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<HsmTemplate | null>(null);
  const [bodyVars, setBodyVars] = useState<string[]>([]);
  const [headerVars, setHeaderVars] = useState<string[]>([]);

  const { data: templates = [], isLoading } = useHsmTemplates(instanceId);
  const sync = useSyncHsmTemplates();
  const send = useSendHsmTemplate();
  const saveMapping = useSaveHsmVarMapping();

  const { data: leadCtx } = useLeadContext(conversationId);

  const { data: savedMapping } = useHsmTemplateVarMapping({
    instanceId,
    templateName: selected?.name ?? '',
    language: selected?.language ?? '',
  });

  const approved = useMemo(
    () =>
      templates
        .filter((t) => t.status === 'APPROVED')
        .filter((t) =>
          search.trim() === '' ? true : t.name.toLowerCase().includes(search.toLowerCase()),
        ),
    [templates, search],
  );

  const bodyComponent = selected?.components?.find((c: any) => c.type === 'BODY' || c.type === 'body');
  const headerComponent = selected?.components?.find((c: any) => c.type === 'HEADER' || c.type === 'header');
  const footerComponent = selected?.components?.find((c: any) => c.type === 'FOOTER' || c.type === 'footer');

  const bodyVarNames = bodyComponent?.text ? extractVariables(bodyComponent.text) : [];
  const headerVarNames =
    headerComponent && (headerComponent.format === 'TEXT' || !headerComponent.format)
      ? extractVariables(headerComponent.text || '')
      : [];

  const hasVariables = bodyVarNames.length > 0 || headerVarNames.length > 0;

  // Auto-preenche quando seleciona template (mapping salvo > sugestão padrão).
  useEffect(() => {
    if (!selected) return;
    const initBody =
      savedMapping?.body_tokens?.length
        ? savedMapping.body_tokens
        : suggestDefaultTokens(bodyVarNames.length);
    const initHeader =
      savedMapping?.header_tokens?.length
        ? savedMapping.header_tokens
        : suggestDefaultTokens(headerVarNames.length);
    setBodyVars(
      Array.from({ length: bodyVarNames.length }, (_, i) => initBody[i] ?? ''),
    );
    setHeaderVars(
      Array.from({ length: headerVarNames.length }, (_, i) => initHeader[i] ?? ''),
    );
  }, [selected, savedMapping, bodyVarNames.length, headerVarNames.length]);

  const reset = () => {
    setSelected(null);
    setBodyVars([]);
    setHeaderVars([]);
    setSearch('');
  };

  const handleSync = async () => {
    try {
      const result = (await sync.mutateAsync(instanceId)) as any;
      toast({
        title: 'Templates sincronizados',
        description: `${result?.synced ?? 0} templates atualizados.`,
      });
    } catch (e: any) {
      toast({ title: 'Falha ao sincronizar', description: e?.message, variant: 'destructive' });
    }
  };

  const handleSend = async () => {
    if (!selected) return;

    // Resolve tokens do sistema com dados do lead.
    const resolvedBody = bodyVars.map((v) => resolveSystemTokens(v, leadCtx ?? null));
    const resolvedHeader = headerVars.map((v) => resolveSystemTokens(v, leadCtx ?? null));

    if (
      resolvedBody.some((v, i) => bodyVarNames[i] && !v.trim()) ||
      resolvedHeader.some((v, i) => headerVarNames[i] && !v.trim())
    ) {
      toast({
        title: 'Variável vazia',
        description:
          'Algumas variáveis ficaram em branco (token sem dado no lead). Edite manualmente antes de enviar.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (onBeforeSend && !(await onBeforeSend())) return;
      await send.mutateAsync({
        instanceId,
        conversationId,
        templateName: selected.name,
        language: selected.language,
        bodyVariables: resolvedBody,
        headerVariables: resolvedHeader,
      });
      toast({ title: 'Template enviado' });

      // Salva mapping em background; falha não bloqueia.
      if (companyId && hasVariables) {
        saveMapping
          .mutateAsync({
            companyId,
            instanceId,
            templateName: selected.name,
            language: selected.language,
            headerTokens: headerVars,
            bodyTokens: bodyVars,
          })
          .catch(() => {});
      }

      setOpen(false);
      reset();
      onSent?.();
    } catch (e: any) {
      toast({
        title: 'Falha ao enviar template',
        description: e?.message,
        variant: 'destructive',
      });
    }
  };

  // Helpers para inserir token no input
  const setBodyAt = (i: number, value: string) =>
    setBodyVars((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  const setHeaderAt = (i: number, value: string) =>
    setHeaderVars((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });

  // Preview com tokens já resolvidos para o lead atual
  const previewHeader = headerComponent?.text
    ? renderTemplateText(
        headerComponent.text,
        headerVars.map((v) => resolveSystemTokens(v, leadCtx ?? null)),
      )
    : '';
  const previewBody = bodyComponent?.text
    ? renderTemplateText(
        bodyComponent.text,
        bodyVars.map((v) => resolveSystemTokens(v, leadCtx ?? null)),
      )
    : '';

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 w-9 h-9" disabled={disabled}>
              <FileText className="w-5 h-5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Templates oficiais (Meta)</TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-[400px] p-0">
        {!selected ? (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 p-3 border-b border-border">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar template..."
                  className="h-8 pl-7 text-xs"
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleSync}
                    disabled={sync.isPending}
                  >
                    {sync.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sincronizar com a Meta</TooltipContent>
              </Tooltip>
            </div>
            <ScrollArea className="max-h-[320px]">
              {isLoading ? (
                <div className="p-4 text-xs text-muted-foreground text-center">Carregando...</div>
              ) : approved.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground text-center">
                  Nenhum template aprovado.
                  <br />
                  Clique em sincronizar para buscar na Meta.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {approved.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(t)}
                        className="w-full text-left px-3 py-2 hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{t.name}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {t.category}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{t.language}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{selected.name}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(null)}>
                  Voltar
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {selected.language} · {selected.category}
              </div>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="p-3 space-y-3">
                {!hasVariables && (
                  <div className="text-[11px] text-muted-foreground border border-dashed border-border rounded-md p-2">
                    Este template não usa variáveis. Confira o preview abaixo e clique em Enviar.
                  </div>
                )}

                {/* Variáveis do header */}
                {headerVarNames.map((n, i) => (
                  <div key={`h-${n}`} className="space-y-1">
                    <Label className="text-xs">Header {`{{${n}}}`}</Label>
                    <div className="flex gap-1">
                      <Input
                        value={headerVars[i] ?? ''}
                        onChange={(e) => setHeaderAt(i, e.target.value)}
                        className="h-8 text-xs font-mono"
                        placeholder="Texto livre ou {{token}}"
                      />
                      <HsmTokenPickerButton
                        onInsert={(token) => setHeaderAt(i, (headerVars[i] ?? '') + token)}
                      />
                    </div>
                  </div>
                ))}

                {/* Variáveis do body */}
                {bodyVarNames.map((n, i) => (
                  <div key={`b-${n}`} className="space-y-1">
                    <Label className="text-xs">Variável {`{{${n}}}`}</Label>
                    <div className="flex gap-1">
                      <Input
                        value={bodyVars[i] ?? ''}
                        onChange={(e) => setBodyAt(i, e.target.value)}
                        className="h-8 text-xs font-mono"
                        placeholder="Texto livre ou {{token}}"
                      />
                      <HsmTokenPickerButton
                        onInsert={(token) => setBodyAt(i, (bodyVars[i] ?? '') + token)}
                      />
                    </div>
                  </div>
                ))}

                {/* Preview */}
                <div className="rounded-md border border-border bg-secondary/30 p-2 text-xs whitespace-pre-wrap">
                  {previewHeader && <div className="font-semibold mb-1">{previewHeader}</div>}
                  {previewBody && <div>{previewBody}</div>}
                  {footerComponent?.text && (
                    <div className="mt-1 text-muted-foreground">{footerComponent.text}</div>
                  )}
                </div>

                {hasVariables && (
                  <div className="text-[10px] text-muted-foreground">
                    Use o ícone ✨ para inserir variáveis do sistema. Mapeamento será salvo para próximas vezes.
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-border flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSend} disabled={send.isPending}>
                {send.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Enviar
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default HsmTemplatePopover;
