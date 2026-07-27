# Metas individuais e por equipe (smart goals)

Evolução da tela `/metas` para suportar metas de grupo, novas métricas e sugestão inteligente de valor-alvo.

## Modelo de dados

**Nova tabela `team_goals`** (metas de equipe — convive com `user_goals` para individuais):

```text
team_goals
├── id, company_id, created_by, created_at, updated_at
├── name              (texto curto: "Vendas SP - Janeiro")
├── scope             ('company' | 'group' | 'pipeline')
├── pipeline_id       (fk pipelines, quando scope='pipeline')
├── group_id          (fk team_goal_groups, quando scope='group')
├── metric            ('leads'|'value'|'conversions'|'ticket_avg'|'conversion_rate'|'response_time'|'messages_sent')
├── target_value      numeric
├── period_start, period_end   (datas livres — período personalizado)
└── status            ('active'|'archived')
```

**Nova tabela `team_goal_groups`** (squads/grupos customizados):
- `id, company_id, name, color`
- `team_goal_group_members (group_id, user_id)`

**Extensão `user_goals.goal_type`** — adicionar as 4 novas métricas no enum/check: `ticket_avg`, `conversion_rate`, `response_time`, `messages_sent`.

GRANTs + RLS por `company_id` em todas (admin gerencia, agente lê metas que o incluem).

## Cálculo de progresso

Estender `useGoalProgress` (hoje só lê `leads`) para suportar todas as métricas:

| Métrica | Fonte |
|---|---|
| `leads` | `leads` count no período |
| `value` | soma `leads.value` no período |
| `conversions` | `leads` where status='won' |
| `ticket_avg` | avg(`leads.value`) where status='won' |
| `conversion_rate` | won ÷ total × 100 |
| `response_time` | avg seg entre `created_at` e `responded_at` (média BAIXA é melhor — inverter barra) |
| `messages_sent` | count `chat_messages` direction='outbound' |

Criar **RPC `get_goal_progress(metric, scope, scope_id, period_start, period_end)`** que retorna valor atual + meta — usado tanto por metas individuais quanto de equipe.

## Sugestão automática de alvo (smart)

Nova **RPC `suggest_goal_target(metric, scope, scope_id, period_days)`**:
- Calcula média dos últimos 3 períodos equivalentes (ex: 3 meses anteriores)
- Retorna `{ baseline, suggested_conservative (-10%), suggested_realistic (+0%), suggested_aggressive (+30%) }`

No dialog de criação, ao escolher métrica + escopo + período, mostra 3 chips clicáveis ("Conservadora R$ 45k", "Realista R$ 50k", "Agressiva R$ 65k") + campo manual.

## UI

**`/metas` ganha tabs internas no painel esquerdo**: `Individuais` | `Equipe`

- **Nova meta** (dropdown) ganha 3 opções: Individual / Equipe / Missão.
- **Dialog `CreateTeamGoalDialog`** (novo):
  - Nome
  - Escopo: radio (Empresa toda / Grupo / Pipeline) → mostra select correspondente
  - Botão "Gerenciar grupos" abre `GoalGroupsManager` (CRUD de grupos + membros)
  - Métrica (7 opções com ícones)
  - Período: `DateRangePicker` (livre)
  - Alvo: 3 chips sugeridos + input manual com `CurrencyInput`/`NumberInput` conforme métrica
- **Dialog individual existente** ganha as novas métricas e os mesmos chips de sugestão.
- **`GoalsListPanel`** renderiza cards diferenciados por escopo (ícone + badge "Empresa" / "Squad SP" / "Funil Vendas") com barra de progresso adequada por métrica.

## Arquivos

Novos:
- `supabase/migrations/<ts>_team_goals.sql` (tabelas + grants + RLS + RPCs)
- `src/hooks/useTeamGoals.ts`
- `src/hooks/useGoalGroups.ts`
- `src/hooks/useGoalSuggestion.ts`
- `src/components/goals/CreateTeamGoalDialog.tsx`
- `src/components/goals/GoalGroupsManager.tsx`
- `src/components/goals/SmartTargetSuggestion.tsx`

Editados:
- `src/pages/Goals.tsx` — tabs Individuais/Equipe + nova opção no dropdown
- `src/components/goals/CreateGoalFromGoalsDialog.tsx` — novas métricas + chips de sugestão
- `src/components/goals/GoalsListPanel.tsx` — render por escopo
- `src/hooks/useGoalProgress.ts` — usar RPC unificada
- `src/hooks/useUserGoals.ts` — tipos atualizados

## Fora de escopo (não entregue agora)

- Recorrência automática / templates de meta / divisão automática entre agentes (podem ser fase 2)
- Períodos pré-definidos (semanal/mensal/trimestral) — apenas Personalizado por enquanto, com shortcuts no DateRangePicker

Aprove o plano para eu seguir com a migração e a implementação.
