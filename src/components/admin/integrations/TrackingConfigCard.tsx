import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useSystemIntegrations, useUpsertIntegration } from '@/hooks/useSystemIntegrations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Activity, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const TrackingConfigCard = () => {
  const { data: cfgs } = useSystemIntegrations();
  const upsert = useUpsertIntegration();
  const cfg = cfgs?.tracking?.value || {};

  const [enabled, setEnabled] = useState(false);
  const [pixelId, setPixelId] = useState('');
  const [testCode, setTestCode] = useState('');
  const [gtmId, setGtmId] = useState('');
  const [gAdsId, setGAdsId] = useState('');
  const [gAdsLabel, setGAdsLabel] = useState('');

  useEffect(() => {
    setEnabled(!!cfg.enabled);
    setPixelId(cfg.meta_pixel_id || '');
    setTestCode(cfg.meta_capi_test_event_code || '');
    setGtmId(cfg.gtm_id || '');
    setGAdsId(cfg.google_ads_id || '');
    setGAdsLabel(cfg.google_ads_conversion_label || '');
  }, [cfg.enabled, cfg.meta_pixel_id, cfg.meta_capi_test_event_code, cfg.gtm_id, cfg.google_ads_id, cfg.google_ads_conversion_label]);

  const save = async () => {
    try {
      await upsert.mutateAsync({
        key: 'tracking',
        value: {
          enabled,
          meta_pixel_id: pixelId.trim(),
          meta_capi_test_event_code: testCode.trim(),
          gtm_id: gtmId.trim(),
          google_ads_id: gAdsId.trim(),
          google_ads_conversion_label: gAdsLabel.trim(),
        },
      });
      toast.success('Configuração de tracking salva');
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  const { data: events } = useQuery({
    queryKey: ['tracking_events_recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tracking_events')
        .select('id, event_name, source, destination, status, created_at, error')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" /> Tracking & Pixels
              </CardTitle>
              <CardDescription>DataLayer + Meta Pixel/CAPI + Google Ads (eventos enriquecidos)</CardDescription>
            </div>
            {enabled ? (
              <Badge variant="outline" className="text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)]">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.30)]">
                <AlertCircle className="h-3 w-3 mr-1" /> Desligado
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded border border-border p-3 bg-muted/20 text-xs">
            Os tokens privados (<code>META_CAPI_ACCESS_TOKEN</code>, <code>GOOGLE_ADS_*</code>) ficam em secrets do projeto.
            O front carrega Pixel/GTM apenas se o tracking estiver ativo.
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <div className="text-sm font-medium">Tracking habilitado</div>
              <div className="text-xs text-muted-foreground">Liga dataLayer no front e disparos server-side (CAPI/GAds).</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Meta Pixel ID</Label>
              <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="123456789012345" />
            </div>
            <div>
              <Label>Meta CAPI test_event_code (opcional)</Label>
              <Input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345" />
            </div>
            <div>
              <Label>GTM Container ID</Label>
              <Input value={gtmId} onChange={(e) => setGtmId(e.target.value)} placeholder="GTM-XXXXXXX" />
            </div>
            <div>
              <Label>Google Ads ID</Label>
              <Input value={gAdsId} onChange={(e) => setGAdsId(e.target.value)} placeholder="AW-1234567890" />
            </div>
            <div className="col-span-2">
              <Label>Google Ads — Conversion Label</Label>
              <Input value={gAdsLabel} onChange={(e) => setGAdsLabel(e.target.value)} placeholder="abcDEFghi-jklMNopQR" />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos eventos disparados</CardTitle>
          <CardDescription>Auditoria server-side (CAPI / Google Ads) — atualiza a cada 15s</CardDescription>
        </CardHeader>
        <CardContent>
          {!events?.length ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Nenhum evento ainda.</div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {events.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={
                      e.status === 'sent' ? 'text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)]'
                      : e.status === 'failed' ? 'text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.30)]'
                      : 'text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.30)]'
                    }>{e.status}</Badge>
                    <span className="font-medium">{e.event_name}</span>
                    <span className="text-muted-foreground">→ {e.destination}</span>
                    {e.error && <span className="text-[hsl(var(--rose))] truncate max-w-[260px]" title={e.error}>{e.error}</span>}
                  </div>
                  <span className="text-muted-foreground shrink-0">
                    {format(new Date(e.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
