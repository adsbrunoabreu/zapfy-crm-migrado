import { useState, useRef, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Camera, Eye, EyeOff, Loader2, Save, Mail, Phone,
  Shield, Building2, LogOut, KeyRound, CheckCircle2, X,
  User, MapPin, IdCard, Calendar,
} from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { CepInput } from '@/components/forms/CepInput';

const ROLE_LABELS: Record<string, { label: string; tone: string }> = {
  master: { label: 'Master', tone: 'bg-[hsl(var(--violet)/0.15)] text-[hsl(var(--violet))] border-[hsl(var(--violet)/0.30)]' },
  company_admin: { label: 'Admin da Empresa', tone: 'bg-[hsl(var(--cyan)/0.15)] text-[hsl(var(--cyan))] border-[hsl(var(--cyan)/0.30)]' },
  user: { label: 'Usuário', tone: 'bg-muted text-muted-foreground border-border' },
};

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

// ====== Máscaras ======
const maskPhone = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const maskCpf = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const maskCep = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

const isValidCpf = (cpf: string) => {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(d[10]);
};

const passwordStrength = (pw: string) => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^\w\s]/.test(pw)) score++;
  return Math.min(score, 4);
};

const STRENGTH_META = [
  { label: 'Muito fraca', color: 'bg-[hsl(var(--rose))]', width: '20%' },
  { label: 'Fraca', color: 'bg-[hsl(var(--rose)/0.7)]', width: '40%' },
  { label: 'Razoável', color: 'bg-[hsl(var(--amber))]', width: '60%' },
  { label: 'Boa', color: 'bg-[hsl(var(--emerald)/0.7)]', width: '80%' },
  { label: 'Forte', color: 'bg-[hsl(var(--emerald))]', width: '100%' },
];

export default function Profile() {
  const { user, profile, signOut } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const p = profile as any;

  // ===== Dados pessoais =====
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [cpf, setCpf] = useState(maskCpf(p?.cpf || ''));
  const [birthDate, setBirthDate] = useState<string>(p?.birth_date || '');
  const [phone, setPhone] = useState(maskPhone(p?.phone || ''));
  const [avatarUrl, setAvatarUrl] = useState(p?.avatar_url || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // ===== Endereço =====
  const [zipCode, setZipCode] = useState(maskCep(p?.zip_code || ''));
  const [street, setStreet] = useState(p?.street || '');
  const [number, setNumber] = useState(p?.number || '');
  const [complement, setComplement] = useState(p?.complement || '');
  const [neighborhood, setNeighborhood] = useState(p?.neighborhood || '');
  const [city, setCity] = useState(p?.city || '');
  const [stateUf, setStateUf] = useState(p?.state || '');
  
  const [isUpdatingAddress, setIsUpdatingAddress] = useState(false);

  // ===== Senha =====
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name || '');
    setCpf(maskCpf(p?.cpf || ''));
    setBirthDate(p?.birth_date || '');
    setPhone(maskPhone(p?.phone || ''));
    setAvatarUrl(p?.avatar_url || '');
    setZipCode(maskCep(p?.zip_code || ''));
    setStreet(p?.street || '');
    setNumber(p?.number || '');
    setComplement(p?.complement || '');
    setNeighborhood(p?.neighborhood || '');
    setCity(p?.city || '');
    setStateUf(p?.state || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, p?.cpf, p?.birth_date, p?.phone, p?.avatar_url, p?.zip_code, p?.street, p?.number, p?.complement, p?.neighborhood, p?.city, p?.state]);

  const { data: company } = useQuery({
    queryKey: ['profile-company', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data } = await supabase
        .from('companies').select('name, plan_status')
        .eq('id', profile.company_id).maybeSingle();
      return data;
    },
    enabled: !!profile?.company_id,
    staleTime: 120_000,
  });

  const role = p?.role || 'user';
  const roleMeta = ROLE_LABELS[role] || ROLE_LABELS.user;

  const initials = useMemo(() => {
    const n = profile?.full_name?.trim();
    if (n) return n.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
    return profile?.email?.[0]?.toUpperCase() || 'U';
  }, [profile?.full_name, profile?.email]);

  const cpfDigits = cpf.replace(/\D/g, '');
  const cpfInvalid = cpfDigits.length > 0 && cpfDigits.length === 11 && !isValidCpf(cpf);

  const personalDirty =
    fullName !== (profile?.full_name || '') ||
    cpfDigits !== (p?.cpf || '').replace(/\D/g, '') ||
    (birthDate || '') !== (p?.birth_date || '') ||
    phone.replace(/\D/g, '') !== (p?.phone || '').replace(/\D/g, '');

  const addressDirty =
    zipCode.replace(/\D/g, '') !== (p?.zip_code || '').replace(/\D/g, '') ||
    street !== (p?.street || '') ||
    number !== (p?.number || '') ||
    complement !== (p?.complement || '') ||
    neighborhood !== (p?.neighborhood || '') ||
    city !== (p?.city || '') ||
    stateUf !== (p?.state || '');

  const strength = passwordStrength(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitPassword = newPassword.length >= 8 && passwordsMatch && !isUpdatingPassword;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) return toast.error('Selecione uma imagem');
    if (file.size > 2 * 1024 * 1024) return toast.error('Máximo 2MB');

    setIsUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${publicUrl}?t=${Date.now()}`;
      const { error: updErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      if (updErr) throw updErr;
      setAvatarUrl(url);
      toast.success('Foto atualizada');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar foto');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUpdatePersonal = async () => {
    if (!user || !personalDirty) return;
    if (!fullName.trim()) return toast.error('Informe seu nome');
    if (cpfInvalid) return toast.error('CPF inválido');
    setIsUpdatingProfile(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.replace(/\D/g, '') || null,
          cpf: cpfDigits || null,
          birth_date: birthDate || null,
        } as any)
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Dados pessoais atualizados');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Lookup de CEP centralizado em useCepLookup (toasts + loading via <CepInput />)

  const handleUpdateAddress = async () => {
    if (!user || !addressDirty) return;
    setIsUpdatingAddress(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({
          zip_code: zipCode.replace(/\D/g, '') || null,
          street: street.trim() || null,
          number: number.trim() || null,
          complement: complement.trim() || null,
          neighborhood: neighborhood.trim() || null,
          city: city.trim() || null,
          state: stateUf || null,
        } as any)
        .eq('id', user.id);
      if (error) throw error;
      toast.success('Endereço atualizado');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar endereço');
    } finally {
      setIsUpdatingAddress(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!canSubmitPassword) return;
    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword(''); setConfirmPassword('');
      toast.success('Senha atualizada');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar senha');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <PageShell
      title="Perfil"
      subtitle="Gerencie suas informações pessoais e segurança"
      icon={<User className="h-4 w-4" />}
    >
      {/* HERO compacto */}
      <Card className="border-border shadow-none">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Avatar className="h-12 w-12">
              <AvatarImage src={avatarUrl} alt={profile?.full_name || ''} />
              <AvatarFallback className="text-sm bg-muted text-foreground">{initials}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="text-[10px] text-muted-foreground hover:text-foreground transition disabled:opacity-50"
            >
              {isUploadingAvatar ? 'Enviando…' : 'Editar foto'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold truncate text-foreground">
                {profile?.full_name || 'Meu perfil'}
              </h1>
              <Badge variant="outline" className="text-xs font-normal px-1.5 py-0 h-5 border-border text-muted-foreground">
                {roleMeta.label}
              </Badge>
              {company?.name && (
                <span className="text-xs text-muted-foreground truncate">{company.name}</span>
              )}
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--emerald))]" />
                Online
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {profile?.email}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('fullName')?.focus()}
            className="shrink-0"
          >
            Editar perfil
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* ============ COLUNA ESQUERDA ============ */}
        <div className="space-y-6">
          {/* DADOS PESSOAIS */}
          <Card className="p-6 space-y-5">
            <div className="flex items-start gap-2">
              <User className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div>
                <h2 className="text-lg font-medium">Dados pessoais</h2>
                <p className="text-xs text-muted-foreground">Atualize seus dados de contato e identificação</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF</Label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="cpf"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="pl-9"
                    inputMode="numeric"
                  />
                </div>
                {cpfInvalid && (
                  <p className="text-xs text-[hsl(var(--rose))]">CPF inválido</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="birthDate">Data de nascimento</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="birthDate"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    placeholder="(11) 91234-5678"
                    className="pl-9"
                    inputMode="tel"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input id="email" value={profile?.email || ''} disabled className="pl-9 bg-muted/30" />
                </div>
              </div>

              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">O e-mail é vinculado à sua conta e não pode ser alterado.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              {personalDirty && <span className="text-xs text-[hsl(var(--amber))] mr-auto">Alterações não salvas</span>}
              <Button onClick={handleUpdatePersonal} disabled={!personalDirty || isUpdatingProfile || cpfInvalid}>
                {isUpdatingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar alterações
              </Button>
            </div>
          </Card>

          {/* ENDEREÇO */}
          <Card className="p-6 space-y-5">
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div>
                <h2 className="text-lg font-medium">Endereço</h2>
                <p className="text-xs text-muted-foreground">Informe seu endereço para faturamento e cobrança</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-6 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="zipCode">CEP</Label>
                <CepInput
                  id="zipCode"
                  value={zipCode}
                  onChange={setZipCode}
                  onAddressFound={(f) => {
                    setStreet(f.address);
                    setNeighborhood(f.neighborhood);
                    setCity(f.city);
                    setStateUf(f.state);
                  }}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-4">
                <Label htmlFor="street">Logradouro</Label>
                <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua, avenida..." />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="number">Número</Label>
                <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123" />
              </div>

              <div className="space-y-1.5 sm:col-span-4">
                <Label htmlFor="complement">Complemento</Label>
                <Input id="complement" value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apto, bloco, sala..." />
              </div>

              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>

              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="state">UF</Label>
                <Select value={stateUf} onValueChange={setStateUf}>
                  <SelectTrigger id="state">
                    <SelectValue placeholder="--" />
                  </SelectTrigger>
                  <SelectContent>
                    {UF_LIST.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              {addressDirty && <span className="text-xs text-[hsl(var(--amber))] mr-auto">Alterações não salvas</span>}
              <Button onClick={handleUpdateAddress} disabled={!addressDirty || isUpdatingAddress}>
                {isUpdatingAddress ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar endereço
              </Button>
            </div>
          </Card>
        </div>

        {/* ============ COLUNA DIREITA ============ */}
        <div className="space-y-6">
          {/* SEGURANÇA */}
          <Card className="p-6 space-y-5">
            <div className="flex items-start gap-2">
              <KeyRound className="h-5 w-5 mt-0.5 text-muted-foreground" />
              <div>
                <h2 className="text-lg font-medium">Segurança</h2>
                <p className="text-xs text-muted-foreground">Use uma senha forte e única para esta conta</p>
              </div>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); if (canSubmitPassword) handleUpdatePassword(); }}
              className="space-y-5"
            >
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={user?.email ?? ''}
                readOnly
                hidden
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {newPassword.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${STRENGTH_META[strength].color}`}
                          style={{ width: STRENGTH_META[strength].width }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Força: <span className="text-foreground">{STRENGTH_META[strength].label}</span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Digite novamente"
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && (
                    <p className={`text-xs flex items-center gap-1 ${passwordsMatch ? 'text-[hsl(var(--emerald))]' : 'text-[hsl(var(--rose))]'}`}>
                      {passwordsMatch ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {passwordsMatch ? 'Senhas coincidem' : 'As senhas não coincidem'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-border">
                <Button type="submit" disabled={!canSubmitPassword} variant="outline">
                  {isUpdatingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Atualizar senha
                </Button>
              </div>
            </form>
          </Card>

          {/* SESSÃO */}
          <Card className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">Sessão</h2>
              <p className="text-xs text-muted-foreground">Encerre sua sessão neste dispositivo</p>
            </div>
            <Button variant="destructive" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" /> Sair da conta
            </Button>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
