import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Users, TrendingUp, UserX, Briefcase, Loader2 } from 'lucide-react';
import { useContacts, useContactsOpportunityCounts } from '@/hooks/useContacts';
import { ContactDrawer } from '@/components/contacts/ContactDrawer';
import { formatLeadCode } from '@/lib/format';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
}

export default function Contacts() {
  const { data: contacts, isLoading } = useContacts();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Abre drawer via ?contact=<id> (ex.: notificação de aniversário)
  useEffect(() => {
    const cid = searchParams.get('contact');
    if (cid) setOpenId(cid);
  }, [searchParams]);


  const contactIds = useMemo(() => (contacts || []).map(c => c.id), [contacts]);
  const { data: counts } = useContactsOpportunityCounts(contactIds);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts || [];
    return (contacts || []).filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email?.toLowerCase().includes(q)) ||
      (c.phone?.includes(q)) ||
      (c.document?.includes(q))
    );
  }, [contacts, search]);

  const total = contacts?.length || 0;
  const withActiveOpp = useMemo(() => {
    if (!counts) return 0;
    return Object.values(counts).filter(c => c.active > 0).length;
  }, [counts]);
  const unassigned = useMemo(() => (contacts || []).filter(c => !c.assigned_to).length, [contacts]);
  const newThisMonth = useMemo(() => {
    const now = new Date();
    return (contacts || []).filter(c => {
      const d = new Date(c.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [contacts]);

  return (
    <PageShell
      title="Contatos"
      subtitle="Pessoas reais, com todo o histórico em um só lugar"
    >
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Kpi icon={<Users className="w-5 h-5" />} label="Total de Contatos" value={total.toString()} />
        <Kpi icon={<TrendingUp className="w-5 h-5" />} label="Novos no mês" value={newThisMonth.toString()} />
        <Kpi icon={<Briefcase className="w-5 h-5" />} label="Com oportunidade ativa" value={withActiveOpp.toString()} />
        <Kpi icon={<UserX className="w-5 h-5" />} label="Sem responsável" value={unassigned.toString()} />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail, telefone ou CPF..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground ml-auto">{filtered.length} resultados</div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">#</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead className="text-center">Oportunidades</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Última interação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  Nenhum contato encontrado
                </TableCell>
              </TableRow>
            )}
            {filtered.map(c => {
              const opps = counts?.[c.id];
              return (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setOpenId(c.id)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatLeadCode(c.tenant_seq || 0)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        {c.avatar_url && <AvatarImage src={c.avatar_url} alt={c.name} />}
                        <AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback>
                      </Avatar>
                      <div className="font-medium text-sm">{c.name}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{c.phone || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.email || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {opps ? (
                      <div className="flex items-center justify-center gap-1">
                        {opps.active > 0 && <Badge variant="default" className="text-[10px]">{opps.active} ativas</Badge>}
                        {opps.total > opps.active && (
                          <Badge variant="outline" className="text-[10px]">{opps.total - opps.active}</Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.assignee?.full_name || c.assignee?.email || (
                      <span className="text-muted-foreground italic">Não atribuído</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.last_interaction_at
                      ? format(new Date(c.last_interaction_at), 'dd/MM/yyyy', { locale: ptBR })
                      : format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <ContactDrawer
        contactId={openId}
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            if (searchParams.get('contact')) {
              const next = new URLSearchParams(searchParams);
              next.delete('contact');
              setSearchParams(next, { replace: true });
            }
          }
        }}
      />
    </PageShell>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </div>
    </Card>
  );
}
