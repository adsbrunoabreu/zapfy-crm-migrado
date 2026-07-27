/**
 * Roadmap — exibe novidades em desenvolvimento e add-ons que poderão
 * ser contratados no futuro. Inclui formulário de sugestões.
 */
import { useState } from 'react';
import {
  Plus,
  Rocket,
  Loader2,
  Lightbulb,
  Send,
  MessageSquare,
} from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRoadmapIcon, type RoadmapItemRow } from '@/data/roadmapItems';
import { RoadmapStatusBadge } from '@/components/roadmap/RoadmapStatusBadge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORY_LABEL: Record<string, string> = {
  feature: 'Nova funcionalidade',
  improvement: 'Melhoria',
  integration: 'Integração',
  bug: 'Problema / Bug',
  other: 'Outro',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Recebida',
  reviewing: 'Em análise',
  planned: 'Planejada',
  in_progress: 'Em desenvolvimento',
  done: 'Concluída',
  rejected: 'Não será feita',
};

const STATUS_CLASS: Record<string, string> = {
  new: 'border-blue-500/40 text-blue-500 bg-blue-500/10',
  reviewing: 'border-amber-500/40 text-amber-500 bg-amber-500/10',
  planned: 'border-violet-500/40 text-violet-500 bg-violet-500/10',
  in_progress: 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10',
  done: 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10',
  rejected: 'border-rose-500/40 text-rose-500 bg-rose-500/10',
};

export default function Roadmap() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['roadmap-items-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roadmap_items' as any)
        .select('*')
        .order('status', { ascending: true })
        .order('sort_order', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as RoadmapItemRow[];
    },
    staleTime: 120_000,
  });

  // Ordem visual desejada: em desenvolvimento → em breve → pronto
  const STATUS_RANK: Record<string, number> = { in_progress: 0, soon: 1, done: 2 };
  const sorted = [...items].sort((a, b) => {
    const r = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
    return r !== 0 ? r : a.sort_order - b.sort_order;
  });

  return (
    <PageShell
      icon={<Rocket className="w-5 h-5" />}
      title="Roadmap"
      subtitle="O que estamos construindo para os próximos meses no zapfy."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Coluna esquerda — itens do roadmap */}
        <div className="space-y-4">
          {isLoading ? (
            <Card className="p-10 flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando roadmap...
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {sorted.map((item) => {
                const Icon = getRoadmapIcon(item.icon);
                return (
                  <Card
                    key={item.id}
                    className="p-5 space-y-3 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-foreground" />
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <RoadmapStatusBadge status={item.status} />
                        {item.addon && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-amber-500 bg-amber-500/10 gap-1.5"
                          >
                            <Plus className="w-3 h-3" />
                            Add-on
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <h2 className="font-display text-lg font-bold">{item.title}</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                    {item.status !== 'soon' && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Progresso</span>
                          <span className="font-medium tabular-nums">{item.progress ?? 0}%</span>
                        </div>
                        <Progress value={item.progress ?? 0} className="h-1.5" />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="p-5 bg-muted/30 border-dashed">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Add-ons:</strong> recursos marcados como
              <span className="mx-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-500 bg-amber-500/10 text-xs">
                <Plus className="w-3 h-3" />
                Add-on
              </span>
              serão comercializados como módulos opcionais que você poderá contratar separadamente
              conforme a necessidade da sua operação.
            </p>
          </Card>
        </div>

        {/* Coluna direita — formulário + sugestões enviadas */}
        <div className="space-y-6 lg:sticky lg:top-4">
          <SuggestionForm />
          <MySuggestionsList />
        </div>
      </div>
    </PageShell>
  );
}

function SuggestionForm() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('feature');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    !!user && title.trim().length >= 4 && description.trim().length >= 10 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('roadmap_suggestions' as any).insert({
        user_id: user.id,
        company_id: (profile as any)?.company_id ?? null,
        category,
        title: title.trim().slice(0, 120),
        description: description.trim().slice(0, 2000),
      } as any);
      if (error) throw error;
      toast.success('Sugestão enviada! Obrigado pelo feedback.');
      setTitle('');
      setDescription('');
      setCategory('feature');
      queryClient.invalidateQueries({ queryKey: ['my-roadmap-suggestions'] });
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao enviar sugestão');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <Lightbulb className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold">Tem uma ideia?</h2>
          <p className="text-sm text-muted-foreground">
            Conte o que faria o zapfy ainda melhor para sua operação. Lemos todas as sugestões.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sg-category">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="sg-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="feature">Nova funcionalidade</SelectItem>
                <SelectItem value="improvement">Melhoria</SelectItem>
                <SelectItem value="integration">Integração</SelectItem>
                <SelectItem value="bug">Problema / Bug</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sg-title">Título</Label>
            <Input
              id="sg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resumo da sua sugestão"
              maxLength={120}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sg-desc">Descrição</Label>
          <Textarea
            id="sg-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Conte com o máximo de detalhes possível: contexto, problema atual, resultado esperado, prints..."
            rows={5}
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground text-right">
            {description.length}/2000
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar sugestão
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface MySuggestionRow {
  id: string;
  category: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
}

function MySuggestionsList() {
  const { user } = useAuth();

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['my-roadmap-suggestions', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roadmap_suggestions' as any)
        .select('id, category, title, description, status, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as MySuggestionRow[];
    },
    staleTime: 60_000,
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5 text-foreground" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold">Suas sugestões</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe o status das ideias que você já enviou.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : suggestions.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          Você ainda não enviou nenhuma sugestão.
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="p-4 rounded-lg border border-border bg-muted/20 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-sm leading-snug">{s.title}</h3>
                <Badge
                  variant="outline"
                  className={STATUS_CLASS[s.status] ?? 'border-border text-muted-foreground'}
                >
                  {STATUS_LABEL[s.status] ?? s.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                {s.description}
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>{CATEGORY_LABEL[s.category] ?? s.category}</span>
                <span>
                  {new Date(s.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
