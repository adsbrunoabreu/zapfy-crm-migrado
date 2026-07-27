import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { fetchAddressByCep, formatCep, formatCnpj, formatBrPhone } from '@/lib/viacep';
import { CepInput } from '@/components/forms/CepInput';
import { isValidCNPJ, unmaskCNPJ } from '@/lib/cnpj';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CompanyProfileValues {
  name: string;
  trade_name: string;
  legal_name: string;
  cnpj: string;
  email: string;
  phone: string;
  website: string;
  zip_code: string;
  address: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  timezone: string;
  logo_url: string | null;
}

export const EMPTY_COMPANY_PROFILE: CompanyProfileValues = {
  name: '',
  trade_name: '',
  legal_name: '',
  cnpj: '',
  email: '',
  phone: '',
  website: '',
  zip_code: '',
  address: '',
  address_number: '',
  address_complement: '',
  neighborhood: '',
  city: '',
  state: '',
  timezone: 'America/Sao_Paulo',
  logo_url: null,
};

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Cuiaba',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Rio_Branco',
  'America/Noronha',
];

interface Props {
  value: CompanyProfileValues;
  onChange: (v: CompanyProfileValues) => void;
  companyId?: string | null; // when set, enables logo upload
  showSubmitButton?: boolean;
  submitting?: boolean;
  onSubmit?: () => void;
  submitLabel?: string;
}

export function CompanyProfileForm({
  value,
  onChange,
  companyId,
  showSubmitButton = false,
  submitting = false,
  onSubmit,
  submitLabel = 'Salvar alterações',
}: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const set = <K extends keyof CompanyProfileValues>(k: K, v: CompanyProfileValues[K]) =>
    onChange({ ...value, [k]: v });

  const applyCepFields = (f: { address: string; neighborhood: string; city: string; state: string }) => {
    onChange({
      ...value,
      address: f.address || value.address,
      neighborhood: f.neighborhood || value.neighborhood,
      city: f.city || value.city,
      state: f.state || value.state,
    });
  };

  const cnpjValid = !value.cnpj || isValidCNPJ(value.cnpj);

  const handleLogoUpload = async (file: File) => {
    if (!companyId) {
      toast({ title: 'Salve a empresa primeiro', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Logo muito grande', description: 'Máximo 2MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${companyId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('company-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('company-logos').getPublicUrl(path);
      set('logo_url', pub.publicUrl);
      toast({ title: 'Logo enviado' });
    } catch (e: any) {
      toast({ title: 'Erro ao enviar logo', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Nome fantasia *</Label>
          <Input value={value.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome da empresa" />
        </div>
        <div className="space-y-1.5">
          <Label>Razão social</Label>
          <Input value={value.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>CNPJ</Label>
          <Input
            value={value.cnpj}
            onChange={(e) => set('cnpj', formatCnpj(e.target.value))}
            placeholder="00.000.000/0000-00"
          />
          {!cnpjValid && <p className="text-xs text-rose">CNPJ inválido</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Select value={value.timezone} onValueChange={(v) => set('timezone', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={value.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Telefone</Label>
          <Input value={value.phone} onChange={(e) => set('phone', formatBrPhone(e.target.value))} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Website</Label>
          <Input value={value.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <Label className="text-sm font-medium">Endereço</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">CEP</Label>
            <CepInput
              value={value.zip_code}
              onChange={(v) => set('zip_code', v)}
              onAddressFound={applyCepFields}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Logradouro</Label>
            <Input value={value.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Número</Label>
            <Input value={value.address_number} onChange={(e) => set('address_number', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Complemento</Label>
            <Input value={value.address_complement} onChange={(e) => set('address_complement', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bairro</Label>
            <Input value={value.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Cidade</Label>
            <Input value={value.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">UF</Label>
            <Input
              value={value.state}
              maxLength={2}
              onChange={(e) => set('state', e.target.value.toUpperCase())}
            />
          </div>
        </div>
      </div>

      {companyId && (
        <div className="space-y-2 border-t border-border pt-4">
          <Label className="text-sm font-medium">Logo</Label>
          <div className="flex items-center gap-4">
            {value.logo_url ? (
              <img src={value.logo_url} alt="logo" className="w-16 h-16 rounded-lg object-cover border border-border" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-muted border border-border" />
            )}
            <div className="flex gap-2">
              <input
                id="company-logo-input"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => document.getElementById('company-logo-input')?.click()}
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {value.logo_url ? 'Alterar logo' : 'Enviar logo'}
              </Button>
              {value.logo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set('logo_url', null)}>
                  Remover
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {showSubmitButton && onSubmit && (
        <div className="pt-4 flex justify-end border-t border-border">
          <Button onClick={onSubmit} disabled={submitting || !value.name.trim() || !cnpjValid}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {submitLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export function companyToProfileValues(c: any): CompanyProfileValues {
  if (!c) return EMPTY_COMPANY_PROFILE;
  return {
    name: c.name || '',
    trade_name: c.trade_name || '',
    legal_name: c.legal_name || '',
    cnpj: c.cnpj ? formatCnpj(c.cnpj) : '',
    email: c.email || '',
    phone: c.phone ? formatBrPhone(c.phone) : '',
    website: c.website || '',
    zip_code: c.zip_code ? formatCep(c.zip_code) : '',
    address: c.address || '',
    address_number: c.address_number || '',
    address_complement: c.address_complement || '',
    neighborhood: c.neighborhood || '',
    city: c.city || '',
    state: c.state || '',
    timezone: c.timezone || 'America/Sao_Paulo',
    logo_url: c.logo_url || null,
  };
}

export function profileValuesToUpdate(v: CompanyProfileValues) {
  return {
    name: v.name.trim(),
    trade_name: v.trade_name.trim() || null,
    legal_name: v.legal_name.trim() || null,
    cnpj: v.cnpj ? unmaskCNPJ(v.cnpj) : null,
    email: v.email.trim() || null,
    phone: v.phone ? v.phone.replace(/\D/g, '') : null,
    website: v.website.trim() || null,
    zip_code: v.zip_code ? v.zip_code.replace(/\D/g, '') : null,
    address: v.address.trim() || null,
    address_number: v.address_number.trim() || null,
    address_complement: v.address_complement.trim() || null,
    neighborhood: v.neighborhood.trim() || null,
    city: v.city.trim() || null,
    state: v.state.trim() || null,
    timezone: v.timezone,
    logo_url: v.logo_url,
  };
}
