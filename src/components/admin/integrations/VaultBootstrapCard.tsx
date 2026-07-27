import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';

/**
 * Sincroniza segredos internos no vault do banco para que triggers
 * (Agente IA, webhooks) consigam invocar edge functions assinadas.
 * Sintoma do bug: mensagem chega no WhatsApp mas a IA não responde
 * mesmo com o add-on ativo, e nenhum run aparece em ai_agent_runs.
 */
export const VaultBootstrapCard = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const sync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('bootstrap-vault', {
        body: {},
      });
      if (error) throw error;
      setResult(JSON.stringify(data?.result || data, null, 2));
      toast.success('Segredos internos sincronizados');
    } catch (e: any) {
      const msg = e?.message || 'Falha ao sincronizar';
      toast.error(msg);
      setResult(`Erro: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border bg-background">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base">Segredos internos do banco</CardTitle>
            <CardDescription>
              Necessário para que triggers internos invoquem o Agente IA e disparem webhooks.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Quando usar</AlertTitle>
          <AlertDescription className="text-xs">
            Execute uma vez após instalação ou se a IA / webhooks pararem de disparar
            automaticamente. A operação é idempotente.
          </AlertDescription>
        </Alert>

        <Button onClick={sync} disabled={loading} size="sm">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizando…
            </>
          ) : (
            'Sincronizar segredos internos'
          )}
        </Button>

        {result && (
          <pre className="text-xs bg-muted/40 border border-border rounded p-3 overflow-auto">
            {result}
          </pre>
        )}
      </CardContent>
    </Card>
  );
};
