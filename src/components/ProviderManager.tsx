/**
 * ProviderManager
 * ---------------
 * Tabela administrativa para gerenciar instâncias de WhatsApp da empresa
 * (Evolution + Cloud API). Permite editar, desconectar e definir como
 * principal, além de adicionar uma nova instância via `ProviderSelector`.
 *
 * Carrega dados de `whatsapp_instances` filtrados pelo `companyId` (RLS
 * garante isolamento; passamos explicitamente para evitar full-scan).
 */
import { useCallback, useEffect, useState } from 'react';
import { Cloud, MoreVertical, Plus, Server, Star, StarOff, Trash2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ProviderService } from '@/services/providerService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import ProviderSelector from './ProviderSelector';
import ProviderStatus from './ProviderStatus';
import type { ProviderType } from '@/types/providers';

interface InstanceRow {
  id: string;
  provider: ProviderType;
  instance_name: string;
  display_name: string | null;
  phone_number: string | null;
  status: string | null;
  is_preferred: boolean;
  is_active: boolean;
}

interface ProviderManagerProps {
  companyId: string;
  /** Callback opcional após editar uma instância. */
  onEdit?: (instance: InstanceRow) => void;
}

export function ProviderManager({ companyId, onEdit }: ProviderManagerProps) {
  const { toast } = useToast();
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('id, provider, instance_name, display_name, phone_number, status, is_preferred, is_active')
      .eq('company_id', companyId)
      .order('is_preferred', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) {
      toast({ title: 'Erro ao carregar instâncias', description: error.message, variant: 'destructive' });
    }
    setInstances((data ?? []) as InstanceRow[]);
    setLoading(false);
  }, [companyId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setPreferred = async (id: string) => {
    // Apenas uma instância pode ser principal por empresa.
    const { error: clearErr } = await supabase
      .from('whatsapp_instances')
      .update({ is_preferred: false })
      .eq('company_id', companyId);
    if (clearErr) {
      toast({ title: 'Falha ao atualizar', description: clearErr.message, variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({ is_preferred: true })
      .eq('id', id);
    if (error) {
      toast({ title: 'Falha ao definir principal', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Instância principal atualizada' });
    load();
  };

  const disconnect = async (id: string) => {
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({ is_active: false, status: 'disconnected' })
      .eq('id', id);
    if (error) {
      toast({ title: 'Falha ao desconectar', description: error.message, variant: 'destructive' });
      return;
    }
    ProviderService.invalidate(id);
    toast({ title: 'Instância desconectada' });
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Conexões WhatsApp</h3>
          <p className="text-xs text-muted-foreground">Gerencie as instâncias conectadas a esta empresa.</p>
        </div>
        <Button size="sm" onClick={() => setSelectorOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Adicionar Outro WhatsApp
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead className="w-[60px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!loading && instances.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma instância conectada.
                </TableCell>
              </TableRow>
            )}
            {instances.map((inst) => (
              <TableRow key={inst.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {inst.provider === 'cloud_api' ? (
                      <Cloud className="h-4 w-4 text-sky-500" />
                    ) : (
                      <Server className="h-4 w-4 text-emerald-500" />
                    )}
                    <div>
                      <div className="text-sm font-medium">
                        {inst.provider === 'cloud_api' ? 'Cloud API' : 'Evolution'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {inst.display_name ?? inst.instance_name}
                      </div>
                    </div>
                    {inst.is_preferred && (
                      <Badge variant="secondary" className="ml-1 gap-1">
                        <Star className="h-3 w-3" /> Principal
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {inst.is_active ? (
                    <ProviderStatus instanceId={inst.id} compact />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Inativa
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {inst.phone_number ? `+${inst.phone_number.replace(/[^\d]/g, '')}` : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit?.(inst)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      {inst.is_preferred ? (
                        <DropdownMenuItem disabled>
                          <StarOff className="mr-2 h-4 w-4" />
                          Já é principal
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setPreferred(inst.id)}>
                          <Star className="mr-2 h-4 w-4" />
                          Definir como principal
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => disconnect(inst.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Desconectar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ProviderSelector open={selectorOpen} onOpenChange={setSelectorOpen} />
    </div>
  );
}

export default ProviderManager;
