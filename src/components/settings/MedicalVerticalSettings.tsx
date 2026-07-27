import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Stethoscope, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyVertical } from '@/hooks/useCompanyVertical';
import { useMyMedicalPractice } from '@/hooks/medical/useMedicalPractice';
import { useToast } from '@/hooks/use-toast';
import { CRMType, BusinessModel, type MedicalPractice } from '@/types/medical';

export default function MedicalVerticalSettings() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: vertical, isLoading: vLoading } = useCompanyVertical();
  const { data: practice, isLoading: pLoading } = useMyMedicalPractice(companyId);

  const [activating, setActivating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<MedicalPractice>>({});

  useEffect(() => {
    if (practice) setForm(practice);
  }, [practice]);

  const isMedical = vertical === 'medical';

  const handleActivate = async () => {
    if (!companyId) return;
    setActivating(true);
    try {
      const { error } = await (supabase as any).rpc('activate_medical_vertical', {
        p_company_id: companyId,
        p_practice_name: null,
        p_crm_type: 'clinic',
        p_business_model: 'fee-based',
      });
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['company-vertical', companyId] }),
        qc.invalidateQueries({ queryKey: ['medical-practice', companyId] }),
      ]);
      toast({ title: 'Vertical médica ativada', description: 'Clínica criada com sucesso.' });
    } catch (e: any) {
      toast({
        title: 'Erro ao ativar',
        description: e?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setActivating(false);
    }
  };

  const handleSave = async () => {
    if (!practice?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('medical_practices')
        .update({
          practice_name: form.practice_name,
          crm_type: form.crm_type,
          business_model: form.business_model,
          cnpj: form.cnpj || null,
          city: form.city || null,
          state: form.state || null,
          whatsapp_integration_enabled: form.whatsapp_integration_enabled ?? true,
          appointment_reminders_enabled: form.appointment_reminders_enabled ?? true,
        })
        .eq('id', practice.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['medical-practice', companyId] });
      toast({ title: 'Clínica atualizada' });
    } catch (e: any) {
      toast({
        title: 'Erro ao salvar',
        description: e?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (vLoading || pLoading) {
    return (
      <Card className="glass-card p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </Card>
    );
  }

  if (!isMedical || !practice) {
    return (
      <Card className="glass-card p-8 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Stethoscope className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Ativar vertical médica</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Transforma esta empresa em uma clínica médica. Habilita o Dashboard Médico com KPIs
            executivos, gestão de pacientes, agenda e métricas específicas do setor.
          </p>
        </div>
        <Button onClick={handleActivate} disabled={activating} className="gap-2">
          {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Ativar vertical médica
        </Button>
      </Card>
    );
  }

  return (
    <Card className="glass-card p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Stethoscope className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Dados da clínica</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="practice_name">Nome da clínica *</Label>
          <Input
            id="practice_name"
            value={form.practice_name ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, practice_name: e.target.value }))}
            className="bg-secondary/50 border-border/50"
          />
        </div>
        <div className="space-y-2">
          <Label>Tipo de CRM</Label>
          <Select
            value={(form.crm_type as string) ?? 'clinic'}
            onValueChange={(v) => setForm((p) => ({ ...p, crm_type: v as CRMType }))}
          >
            <SelectTrigger className="bg-secondary/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clinic">Clínica</SelectItem>
              <SelectItem value="dental">Odontológica</SelectItem>
              <SelectItem value="surgery">Cirúrgica</SelectItem>
              <SelectItem value="hospital">Hospitalar</SelectItem>
              <SelectItem value="consultation">Consultório</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Modelo de negócio</Label>
          <Select
            value={(form.business_model as string) ?? 'fee-based'}
            onValueChange={(v) => setForm((p) => ({ ...p, business_model: v as BusinessModel }))}
          >
            <SelectTrigger className="bg-secondary/50 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fee-based">Particular</SelectItem>
              <SelectItem value="insurance">Convênio</SelectItem>
              <SelectItem value="hybrid">Híbrido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cnpj">CNPJ</Label>
          <Input
            id="cnpj"
            value={form.cnpj ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))}
            className="bg-secondary/50 border-border/50"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Cidade</Label>
          <Input
            id="city"
            value={form.city ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
            className="bg-secondary/50 border-border/50"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">UF</Label>
          <Input
            id="state"
            maxLength={2}
            value={form.state ?? ''}
            onChange={(e) =>
              setForm((p) => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))
            }
            className="bg-secondary/50 border-border/50"
          />
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Integração WhatsApp</p>
            <p className="text-xs text-muted-foreground">Envio e recebimento de mensagens.</p>
          </div>
          <Switch
            checked={form.whatsapp_integration_enabled ?? true}
            onCheckedChange={(v) => setForm((p) => ({ ...p, whatsapp_integration_enabled: v }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Lembretes automáticos</p>
            <p className="text-xs text-muted-foreground">Envia lembretes de consulta aos pacientes.</p>
          </div>
          <Switch
            checked={form.appointment_reminders_enabled ?? true}
            onCheckedChange={(v) => setForm((p) => ({ ...p, appointment_reminders_enabled: v }))}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </Card>
  );
}
