import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import {
  CompanyProfileForm,
  EMPTY_COMPANY_PROFILE,
  type CompanyProfileValues,
  profileValuesToUpdate,
} from './CompanyProfileForm';
import { useCreateCompany, useUpdateCompany } from '@/hooks/useCompanies';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface AdminForm {
  full_name: string;
  email: string;
  password: string;
}

export function CompanyCreateWizard({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const [step, setStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<CompanyProfileValues>(EMPTY_COMPANY_PROFILE);
  const [planStatus, setPlanStatus] = useState<'trial' | 'active'>('trial');
  const [admin, setAdmin] = useState<AdminForm>({ full_name: '', email: '', password: '' });
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [submittingAdmin, setSubmittingAdmin] = useState(false);

  const reset = () => {
    setStep(1);
    setProfile(EMPTY_COMPANY_PROFILE);
    setPlanStatus('trial');
    setAdmin({ full_name: '', email: '', password: '' });
    setCreatedCompanyId(null);
  };

  const handleClose = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(reset, 300);
  };

  const handleStep1Next = async () => {
    if (!profile.name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    try {
      const payload = profileValuesToUpdate(profile);
      const created = await createCompany.mutateAsync({
        ...payload,
        plan_status: planStatus,
      } as any);
      setCreatedCompanyId(created.id);
      // upload logo handled via separate uploader after creation if needed (logo_url already set if pre-uploaded)
      setStep(2);
    } catch (e: any) {
      toast({ title: 'Erro ao criar empresa', description: e.message, variant: 'destructive' });
    }
  };

  const handleCreateAdmin = async () => {
    if (!createdCompanyId) return;
    if (!admin.full_name.trim() || !admin.email.trim() || admin.password.length < 6) {
      toast({
        title: 'Dados incompletos',
        description: 'Nome, e-mail e senha (mín. 6 caracteres) são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }
    setSubmittingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-team-member', {
        body: {
          name: admin.full_name,
          email: admin.email,
          password: admin.password,
          role: 'admin',
          company_id: createdCompanyId,
        },
      });
      if (error || (data as any)?.error) {
        const msg = (data as any)?.error || error?.message || 'Erro';
        throw new Error(msg);
      }
      toast({ title: 'Empresa criada com administrador!' });
      handleClose(false);
    } catch (e: any) {
      toast({ title: 'Erro ao criar admin', description: e.message, variant: 'destructive' });
    } finally {
      setSubmittingAdmin(false);
    }
  };

  const skipAdmin = () => {
    toast({ title: 'Empresa criada', description: 'Você pode adicionar usuários depois.' });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {step === 1 ? 'Nova empresa — Dados cadastrais' : 'Nova empresa — Administrador inicial'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 py-2 -mx-1 px-1">
            <CompanyProfileForm value={profile} onChange={setProfile} companyId={createdCompanyId} />
            <div className="space-y-1.5 border-t border-border pt-4">
              <Label>Status do plano</Label>
              <Select value={planStatus} onValueChange={(v) => setPlanStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={handleStep1Next} disabled={createCompany.isPending || !profile.name.trim()}>
                {createCompany.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                Próximo
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 py-2 -mx-1 px-1">
            <p className="text-sm text-muted-foreground">
              Crie o primeiro administrador da empresa <span className="text-foreground font-medium">{profile.name}</span>.
              Ele poderá acessar imediatamente com o e-mail e senha definidos.
            </p>
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={admin.full_name} onChange={(e) => setAdmin({ ...admin, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail *</Label>
              <Input type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Senha provisória *</Label>
              <Input
                type="password"
                value={admin.password}
                onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                placeholder="Mín. 6 caracteres"
              />
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={skipAdmin}>Pular esta etapa</Button>
              <Button onClick={handleCreateAdmin} disabled={submittingAdmin}>
                {submittingAdmin ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Criar admin e finalizar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
