import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSystemIntegrations, useUpsertIntegration } from '@/hooks/useSystemIntegrations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mail, CheckCircle2, AlertCircle, Send } from 'lucide-react';

export const ResendConfigCard = () => {
  const { data: cfgs } = useSystemIntegrations();
  const upsert = useUpsertIntegration();
  const cfg = cfgs?.resend?.value || {};

  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setFromEmail(cfg.from_email || '');
    setFromName(cfg.from_name || '');
  }, [cfg.from_email, cfg.from_name]);

  const save = async () => {
    try {
      await upsert.mutateAsync({
        key: 'resend',
        value: { from_email: fromEmail, from_name: fromName, configured: true },
      });
      toast.success('Configuração salva');
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  const sendTest = async () => {
    if (!testEmail) return toast.error('Informe um e-mail');
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: testEmail,
          subject: 'Teste de envio - CRM',
          html: '<h2>Teste de envio</h2><p>Se você recebeu este e-mail, sua integração com o Resend está funcionando!</p>',
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha');
      toast.success('E-mail de teste enviado!');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Resend (E-mail)
            </CardTitle>
            <CardDescription>Configure o serviço de envio de e-mails da plataforma</CardDescription>
          </div>
          {cfg.configured ? (
            <Badge variant="outline" className="text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)]">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Configurado
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.30)]">
              <AlertCircle className="h-3 w-3 mr-1" /> Pendente
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded border border-border p-3 bg-muted/20 text-xs">
          A <b>API Key</b> do Resend é armazenada como secret seguro do projeto. Para alterá-la, use a opção de
          atualizar secret no painel do Lovable Cloud.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>E-mail remetente</Label>
            <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="no-reply@suaempresa.com" />
          </div>
          <div>
            <Label>Nome remetente</Label>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="CRM" />
          </div>
        </div>

        <Button onClick={save} disabled={upsert.isPending}>
          {upsert.isPending ? 'Salvando...' : 'Salvar configuração'}
        </Button>

        <div className="border-t pt-4">
          <Label>Enviar e-mail de teste</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="seu@email.com"
              type="email"
            />
            <Button variant="outline" onClick={sendTest} disabled={sending}>
              <Send className="h-4 w-4 mr-2" /> {sending ? 'Enviando...' : 'Enviar'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
