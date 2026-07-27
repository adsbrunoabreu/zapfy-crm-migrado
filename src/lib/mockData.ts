// Centralized mock data for all pages when no real data exists

const MOCK_USER_ID = 'mock-user-001';
const MOCK_COMPANY_ID = 'mock-company-001';

const now = new Date();
const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600000).toISOString();
const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();

export const MOCK_PIPELINES = [
  {
    id: 'mock-pipeline-1',
    name: 'Vendas B2B',
    description: 'Pipeline principal de vendas empresariais',
    is_default: true,
    company_id: MOCK_COMPANY_ID,
    created_at: d(90),
    updated_at: d(1),
    stages: [
      { id: 'mock-stage-1', name: 'Prospecção', color: '#06b6d4', position: 0, pipeline_id: 'mock-pipeline-1' },
      { id: 'mock-stage-2', name: 'Qualificação', color: '#8b5cf6', position: 1, pipeline_id: 'mock-pipeline-1' },
      { id: 'mock-stage-3', name: 'Proposta', color: '#ec4899', position: 2, pipeline_id: 'mock-pipeline-1' },
      { id: 'mock-stage-4', name: 'Negociação', color: '#f59e0b', position: 3, pipeline_id: 'mock-pipeline-1' },
      { id: 'mock-stage-5', name: 'Fechamento', color: '#10b981', position: 4, pipeline_id: 'mock-pipeline-1' },
    ],
  },
  {
    id: 'mock-pipeline-2',
    name: 'Pós-Venda',
    description: 'Acompanhamento de clientes',
    is_default: false,
    company_id: MOCK_COMPANY_ID,
    created_at: d(60),
    updated_at: d(5),
    stages: [
      { id: 'mock-stage-6', name: 'Onboarding', color: '#6366f1', position: 0, pipeline_id: 'mock-pipeline-2' },
      { id: 'mock-stage-7', name: 'Acompanhamento', color: '#14b8a6', position: 1, pipeline_id: 'mock-pipeline-2' },
      { id: 'mock-stage-8', name: 'Renovação', color: '#f97316', position: 2, pipeline_id: 'mock-pipeline-2' },
    ],
  },
];

export const MOCK_LEADS = [
  { id: 'mock-lead-1', name: 'Maria Silva', phone: '5511999887766', email: 'maria@empresa.com', value: 15000, status: 'qualified' as const, notes: 'Interesse em plano enterprise', pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-2', company_id: MOCK_COMPANY_ID, assigned_to: MOCK_USER_ID, created_at: h(2), updated_at: h(1), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Qualificação' }, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' } },
  { id: 'mock-lead-2', name: 'João Santos', phone: '5511988776655', email: 'joao@tech.io', value: 8500, status: 'proposal' as const, notes: 'Proposta enviada aguardando retorno', pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-3', company_id: MOCK_COMPANY_ID, assigned_to: MOCK_USER_ID, created_at: h(8), updated_at: h(4), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Proposta' }, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' } },
  { id: 'mock-lead-3', name: 'Ana Costa', phone: '5521977665544', email: 'ana@startup.co', value: 22000, status: 'new' as const, notes: null, pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-1', company_id: MOCK_COMPANY_ID, assigned_to: MOCK_USER_ID, created_at: h(16), updated_at: h(16), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Prospecção' }, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' } },
  { id: 'mock-lead-4', name: 'Pedro Oliveira', phone: '5531966554433', email: 'pedro@industria.com.br', value: 5200, status: 'contacted' as const, notes: 'Ligação agendada para amanhã', pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-1', company_id: MOCK_COMPANY_ID, assigned_to: 'mock-user-002', created_at: d(1), updated_at: h(6), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Prospecção' }, assignee: { id: 'mock-user-002', full_name: 'Carlos Admin', email: 'carlos@empresa.com' } },
  { id: 'mock-lead-5', name: 'Carla Ferreira', phone: '5541955443322', email: 'carla@ecommerce.com', value: 31000, status: 'won' as const, notes: 'Contrato assinado!', pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-5', company_id: MOCK_COMPANY_ID, assigned_to: MOCK_USER_ID, created_at: d(3), updated_at: d(1), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Fechamento' }, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' } },
  { id: 'mock-lead-6', name: 'Roberto Almeida', phone: '5511944332211', email: 'roberto@agencia.digital', value: 12800, status: 'negotiation' as const, notes: 'Negociando desconto', pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-4', company_id: MOCK_COMPANY_ID, assigned_to: 'mock-user-002', created_at: d(5), updated_at: d(2), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Negociação' }, assignee: { id: 'mock-user-002', full_name: 'Carlos Admin', email: 'carlos@empresa.com' } },
  { id: 'mock-lead-7', name: 'Fernanda Lima', phone: '5521933221100', email: 'fernanda@consultoria.com', value: 9400, status: 'qualified' as const, notes: null, pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-2', company_id: MOCK_COMPANY_ID, assigned_to: MOCK_USER_ID, created_at: d(7), updated_at: d(4), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Qualificação' }, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' } },
  { id: 'mock-lead-8', name: 'Lucas Mendes', phone: '5531922110099', email: 'lucas@varejo.net', value: 18500, status: 'won' as const, notes: 'Cliente satisfeito', pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-5', company_id: MOCK_COMPANY_ID, assigned_to: 'mock-user-003', created_at: d(10), updated_at: d(3), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Fechamento' }, assignee: { id: 'mock-user-003', full_name: 'Ana Vendas', email: 'ana.v@empresa.com' } },
  { id: 'mock-lead-9', name: 'Patrícia Souza', phone: '5541911009988', email: 'patricia@logistica.com', value: 7600, status: 'lost' as const, notes: 'Optou pela concorrência', pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-3', company_id: MOCK_COMPANY_ID, assigned_to: MOCK_USER_ID, created_at: d(14), updated_at: d(8), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Proposta' }, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' } },
  { id: 'mock-lead-10', name: 'Ricardo Torres', phone: '5511900998877', email: 'ricardo@fintech.app', value: 42000, status: 'proposal' as const, notes: 'Proposta de alto valor', pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-3', company_id: MOCK_COMPANY_ID, assigned_to: 'mock-user-002', created_at: d(2), updated_at: d(1), pipeline: { name: 'Vendas B2B' }, stage: { name: 'Proposta' }, assignee: { id: 'mock-user-002', full_name: 'Carlos Admin', email: 'carlos@empresa.com' } },
];

export const MOCK_TEAM_MEMBERS = [
  { id: MOCK_USER_ID, name: 'Você (Demo)', email: 'demo@empresa.com', role: 'company_admin' as const, createdAt: d(120), status: 'online', isOnline: true, lastSeen: h(0), isActive: true },
  { id: 'mock-user-002', name: 'Carlos Admin', email: 'carlos@empresa.com', role: 'company_admin' as const, createdAt: d(90), status: 'online', isOnline: true, lastSeen: h(0), isActive: true },
  { id: 'mock-user-003', name: 'Ana Vendas', email: 'ana.v@empresa.com', role: 'user' as const, createdAt: d(60), status: 'away', isOnline: false, lastSeen: h(0.5), isActive: true },
  { id: 'mock-user-004', name: 'Bruno Suporte', email: 'bruno@empresa.com', role: 'user' as const, createdAt: d(45), status: 'offline', isOnline: false, lastSeen: d(1), isActive: true },
  { id: 'mock-user-005', name: 'Daniela Marketing', email: 'daniela@empresa.com', role: 'user' as const, createdAt: d(30), status: 'offline', isOnline: false, lastSeen: d(2), isActive: false },
];

export const MOCK_CONVERSATIONS = [
  { id: 'mock-conv-1', company_id: MOCK_COMPANY_ID, instance_name: 'default', remote_jid: '5511999887766@s.whatsapp.net', phone: '5511999887766', contact_name: 'Maria Silva', contact_photo_url: null, last_message_text: 'Olá! Gostaria de saber mais sobre o plano enterprise', last_message_at: h(0.5), unread_count: 3, is_archived: false, lead_id: 'mock-lead-1', created_at: d(15), updated_at: h(0.5) },
  { id: 'mock-conv-2', company_id: MOCK_COMPANY_ID, instance_name: 'default', remote_jid: '5511988776655@s.whatsapp.net', phone: '5511988776655', contact_name: 'João Santos', contact_photo_url: null, last_message_text: 'Recebi a proposta, vou analisar e retorno', last_message_at: h(2), unread_count: 0, is_archived: false, lead_id: 'mock-lead-2', created_at: d(10), updated_at: h(2) },
  { id: 'mock-conv-3', company_id: MOCK_COMPANY_ID, instance_name: 'default', remote_jid: '5521977665544@s.whatsapp.net', phone: '5521977665544', contact_name: 'Ana Costa', contact_photo_url: null, last_message_text: 'Vi o anúncio de vocês, podem me enviar mais informações?', last_message_at: h(5), unread_count: 1, is_archived: false, lead_id: 'mock-lead-3', created_at: d(3), updated_at: h(5) },
  { id: 'mock-conv-4', company_id: MOCK_COMPANY_ID, instance_name: 'default', remote_jid: '5531966554433@s.whatsapp.net', phone: '5531966554433', contact_name: 'Pedro Oliveira', contact_photo_url: null, last_message_text: 'Podemos agendar uma call para amanhã?', last_message_at: h(12), unread_count: 0, is_archived: false, lead_id: 'mock-lead-4', created_at: d(8), updated_at: h(12) },
  { id: 'mock-conv-5', company_id: MOCK_COMPANY_ID, instance_name: 'default', remote_jid: '5541955443322@s.whatsapp.net', phone: '5541955443322', contact_name: 'Carla Ferreira', contact_photo_url: null, last_message_text: 'Contrato assinado! Quando começamos?', last_message_at: d(1), unread_count: 0, is_archived: false, lead_id: 'mock-lead-5', created_at: d(20), updated_at: d(1) },
  { id: 'mock-conv-6', company_id: MOCK_COMPANY_ID, instance_name: 'default', remote_jid: '5511944332211@s.whatsapp.net', phone: '5511944332211', contact_name: 'Roberto Almeida', contact_photo_url: null, last_message_text: 'Conseguem um desconto de 15%?', last_message_at: d(2), unread_count: 2, is_archived: false, lead_id: 'mock-lead-6', created_at: d(12), updated_at: d(2) },
];

export const MOCK_GOALS = [
  { id: 'mock-goal-1', company_id: MOCK_COMPANY_ID, user_id: MOCK_USER_ID, goal_type: 'leads', target_value: 50, period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], period_end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0], created_at: d(30), created_by: MOCK_USER_ID, user: { full_name: 'Você (Demo)', email: 'demo@empresa.com' } },
  { id: 'mock-goal-2', company_id: MOCK_COMPANY_ID, user_id: MOCK_USER_ID, goal_type: 'value', target_value: 100000, period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], period_end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0], created_at: d(30), created_by: MOCK_USER_ID, user: { full_name: 'Você (Demo)', email: 'demo@empresa.com' } },
  { id: 'mock-goal-3', company_id: MOCK_COMPANY_ID, user_id: 'mock-user-002', goal_type: 'conversions', target_value: 10, period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], period_end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0], created_at: d(30), created_by: MOCK_USER_ID, user: { full_name: 'Carlos Admin', email: 'carlos@empresa.com' } },
  { id: 'mock-goal-4', company_id: MOCK_COMPANY_ID, user_id: 'mock-user-003', goal_type: 'leads', target_value: 30, period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0], period_end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0], created_at: d(25), created_by: MOCK_USER_ID, user: { full_name: 'Ana Vendas', email: 'ana.v@empresa.com' } },
];

export const MOCK_SYSTEM_LOGS = [
  { id: 'mock-log-1', company_id: MOCK_COMPANY_ID, source: 'webhook', level: 'info', event: 'lead.created', message: 'Lead "Maria Silva" criado via webhook', instance_name: 'default', metadata: { lead_id: 'mock-lead-1' }, created_at: h(0.5) },
  { id: 'mock-log-2', company_id: MOCK_COMPANY_ID, source: 'system', level: 'info', event: 'message.received', message: 'Nova mensagem recebida de 5511999887766', instance_name: 'default', metadata: null, created_at: h(1) },
  { id: 'mock-log-3', company_id: MOCK_COMPANY_ID, source: 'evolution', level: 'warning', event: 'connection.unstable', message: 'Conexão WhatsApp instável - reconectando', instance_name: 'default', metadata: { retries: 2 }, created_at: h(3) },
  { id: 'mock-log-4', company_id: MOCK_COMPANY_ID, source: 'system', level: 'info', event: 'lead.stage_changed', message: 'Lead "João Santos" movido para "Proposta"', instance_name: null, metadata: { lead_id: 'mock-lead-2', stage: 'Proposta' }, created_at: h(5) },
  { id: 'mock-log-5', company_id: MOCK_COMPANY_ID, source: 'evolution', level: 'info', event: 'message.sent', message: 'Mensagem enviada para 5511988776655', instance_name: 'default', metadata: null, created_at: h(6) },
  { id: 'mock-log-6', company_id: MOCK_COMPANY_ID, source: 'webhook', level: 'error', event: 'webhook.delivery_failed', message: 'Falha ao entregar webhook para https://api.external.com/hook', instance_name: null, metadata: { status_code: 500, url: 'https://api.external.com/hook' }, created_at: h(8) },
  { id: 'mock-log-7', company_id: MOCK_COMPANY_ID, source: 'system', level: 'info', event: 'lead.won', message: 'Lead "Carla Ferreira" marcado como ganho - R$ 31.000', instance_name: null, metadata: { lead_id: 'mock-lead-5', value: 31000 }, created_at: d(1) },
  { id: 'mock-log-8', company_id: MOCK_COMPANY_ID, source: 'evolution', level: 'info', event: 'connection.connected', message: 'WhatsApp conectado com sucesso', instance_name: 'default', metadata: null, created_at: d(1) },
  { id: 'mock-log-9', company_id: MOCK_COMPANY_ID, source: 'system', level: 'info', event: 'scheduled.sent', message: 'Mensagem agendada enviada para "Pedro Oliveira"', instance_name: 'default', metadata: null, created_at: d(2) },
  { id: 'mock-log-10', company_id: MOCK_COMPANY_ID, source: 'system', level: 'warning', event: 'rate_limit', message: 'Limite de envio próximo: 180/200 mensagens na última hora', instance_name: 'default', metadata: { sent: 180, limit: 200 }, created_at: d(3) },
];

export const MOCK_SCHEDULED_MESSAGES = [
  { id: 'mock-sched-1', lead_id: 'mock-lead-1', company_id: MOCK_COMPANY_ID, message: 'Olá Maria! Tudo bem? Gostaria de dar seguimento à nossa conversa sobre o plano enterprise.', send_at: new Date(now.getTime() + 3600000 * 2).toISOString(), sent_at: null, status: 'pending' as const, error_message: null, created_by: MOCK_USER_ID, created_at: h(1), message_type: 'text' as const, media_url: null, media_caption: null, media_filename: null, media_mimetype: null, lead: { id: 'mock-lead-1', name: 'Maria Silva', phone: '5511999887766', email: 'maria@empresa.com', value: 15000, status: 'qualified' as const, notes: null, assigned_to: MOCK_USER_ID, created_at: h(2), pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-2', avatar_url: null, company_id: MOCK_COMPANY_ID } },
  { id: 'mock-sched-2', lead_id: 'mock-lead-4', company_id: MOCK_COMPANY_ID, message: 'Pedro, bom dia! Confirmando nossa call para hoje às 14h.', send_at: new Date(now.getTime() + 3600000 * 5).toISOString(), sent_at: null, status: 'pending' as const, error_message: null, created_by: MOCK_USER_ID, created_at: h(12), message_type: 'text' as const, media_url: null, media_caption: null, media_filename: null, media_mimetype: null, lead: { id: 'mock-lead-4', name: 'Pedro Oliveira', phone: '5531966554433', email: 'pedro@industria.com.br', value: 5200, status: 'contacted' as const, notes: null, assigned_to: 'mock-user-002', created_at: d(1), pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-1', avatar_url: null, company_id: MOCK_COMPANY_ID } },
  { id: 'mock-sched-3', lead_id: 'mock-lead-2', company_id: MOCK_COMPANY_ID, message: 'João, alguma dúvida sobre a proposta enviada?', send_at: d(1), sent_at: d(1), status: 'sent' as const, error_message: null, created_by: MOCK_USER_ID, created_at: d(2), message_type: 'text' as const, media_url: null, media_caption: null, media_filename: null, media_mimetype: null, lead: { id: 'mock-lead-2', name: 'João Santos', phone: '5511988776655', email: 'joao@tech.io', value: 8500, status: 'proposal' as const, notes: null, assigned_to: MOCK_USER_ID, created_at: h(8), pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-3', avatar_url: null, company_id: MOCK_COMPANY_ID } },
  { id: 'mock-sched-4', lead_id: 'mock-lead-6', company_id: MOCK_COMPANY_ID, message: 'Roberto, analisamos e conseguimos um desconto de 10%. Vamos fechar?', send_at: new Date(now.getTime() + 3600000 * 24).toISOString(), sent_at: null, status: 'pending' as const, error_message: null, created_by: 'mock-user-002', created_at: h(6), message_type: 'text' as const, media_url: null, media_caption: null, media_filename: null, media_mimetype: null, lead: { id: 'mock-lead-6', name: 'Roberto Almeida', phone: '5511944332211', email: 'roberto@agencia.digital', value: 12800, status: 'negotiation' as const, notes: null, assigned_to: 'mock-user-002', created_at: d(5), pipeline_id: 'mock-pipeline-1', stage_id: 'mock-stage-4', avatar_url: null, company_id: MOCK_COMPANY_ID } },
];

export const MOCK_PIPELINE_STAGES_WITH_LEADS = [
  {
    id: 'mock-stage-1', name: 'Prospecção', color: '#06b6d4', position: 0, pipeline_id: 'mock-pipeline-1',
    leads: [
      { id: 'mock-lead-3', name: 'Ana Costa', phone: '5521977665544', email: 'ana@startup.co', value: 22000, status: 'new', created_at: h(16), assigned_to: MOCK_USER_ID, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' }, tags: [{ id: 'mock-tag-3', name: 'Enterprise', color: '#8b5cf6' }], hasPendingActivities: false },
      { id: 'mock-lead-4', name: 'Pedro Oliveira', phone: '5531966554433', email: 'pedro@industria.com.br', value: 5200, status: 'contacted', created_at: d(1), assigned_to: 'mock-user-002', assignee: { id: 'mock-user-002', full_name: 'Carlos Admin', email: 'carlos@empresa.com' }, tags: [], hasPendingActivities: true },
      { id: 'mock-lead-11', name: 'Gustavo Prado', phone: '5511912345678', email: 'gustavo@logistica.com', value: 8900, status: 'new', created_at: h(4), assigned_to: MOCK_USER_ID, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' }, tags: [{ id: 'mock-tag-4', name: 'Indicação', color: '#10b981' }], hasPendingActivities: false },
    ],
  },
  {
    id: 'mock-stage-2', name: 'Qualificação', color: '#8b5cf6', position: 1, pipeline_id: 'mock-pipeline-1',
    leads: [
      { id: 'mock-lead-1', name: 'Maria Silva', phone: '5511999887766', email: 'maria@empresa.com', value: 15000, status: 'qualified', created_at: h(2), assigned_to: MOCK_USER_ID, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' }, tags: [{ id: 'mock-tag-1', name: 'VIP', color: '#f59e0b' }, { id: 'mock-tag-3', name: 'Enterprise', color: '#8b5cf6' }], hasPendingActivities: true },
      { id: 'mock-lead-7', name: 'Fernanda Lima', phone: '5521933221100', email: 'fernanda@consultoria.com', value: 9400, status: 'qualified', created_at: d(7), assigned_to: MOCK_USER_ID, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' }, tags: [], hasPendingActivities: false },
    ],
  },
  {
    id: 'mock-stage-3', name: 'Proposta', color: '#ec4899', position: 2, pipeline_id: 'mock-pipeline-1',
    leads: [
      { id: 'mock-lead-2', name: 'João Santos', phone: '5511988776655', email: 'joao@tech.io', value: 8500, status: 'proposal', created_at: h(8), assigned_to: MOCK_USER_ID, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' }, tags: [{ id: 'mock-tag-2', name: 'Urgente', color: '#ef4444' }], hasPendingActivities: false },
      { id: 'mock-lead-10', name: 'Ricardo Torres', phone: '5511900998877', email: 'ricardo@fintech.app', value: 42000, status: 'proposal', created_at: d(2), assigned_to: 'mock-user-002', assignee: { id: 'mock-user-002', full_name: 'Carlos Admin', email: 'carlos@empresa.com' }, tags: [{ id: 'mock-tag-1', name: 'VIP', color: '#f59e0b' }], hasPendingActivities: true },
      { id: 'mock-lead-9', name: 'Patrícia Souza', phone: '5541911009988', email: 'patricia@logistica.com', value: 7600, status: 'proposal', created_at: d(14), assigned_to: MOCK_USER_ID, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' }, tags: [], hasPendingActivities: false },
    ],
  },
  {
    id: 'mock-stage-4', name: 'Negociação', color: '#f59e0b', position: 3, pipeline_id: 'mock-pipeline-1',
    leads: [
      { id: 'mock-lead-6', name: 'Roberto Almeida', phone: '5511944332211', email: 'roberto@agencia.digital', value: 12800, status: 'negotiation', created_at: d(5), assigned_to: 'mock-user-002', assignee: { id: 'mock-user-002', full_name: 'Carlos Admin', email: 'carlos@empresa.com' }, tags: [{ id: 'mock-tag-2', name: 'Urgente', color: '#ef4444' }], hasPendingActivities: true },
      { id: 'mock-lead-12', name: 'Camila Ramos', phone: '5521998765432', email: 'camila@design.co', value: 19500, status: 'negotiation', created_at: d(3), assigned_to: 'mock-user-003', assignee: { id: 'mock-user-003', full_name: 'Ana Vendas', email: 'ana.v@empresa.com' }, tags: [{ id: 'mock-tag-3', name: 'Enterprise', color: '#8b5cf6' }], hasPendingActivities: false },
    ],
  },
  {
    id: 'mock-stage-5', name: 'Fechamento', color: '#10b981', position: 4, pipeline_id: 'mock-pipeline-1',
    leads: [
      { id: 'mock-lead-5', name: 'Carla Ferreira', phone: '5541955443322', email: 'carla@ecommerce.com', value: 31000, status: 'won', created_at: d(3), assigned_to: MOCK_USER_ID, assignee: { id: MOCK_USER_ID, full_name: 'Você', email: 'demo@empresa.com' }, tags: [{ id: 'mock-tag-1', name: 'VIP', color: '#f59e0b' }], hasPendingActivities: false },
      { id: 'mock-lead-8', name: 'Lucas Mendes', phone: '5531922110099', email: 'lucas@varejo.net', value: 18500, status: 'won', created_at: d(10), assigned_to: 'mock-user-003', assignee: { id: 'mock-user-003', full_name: 'Ana Vendas', email: 'ana.v@empresa.com' }, tags: [{ id: 'mock-tag-4', name: 'Indicação', color: '#10b981' }], hasPendingActivities: false },
    ],
  },
];

export const MOCK_TAGS = [
  { id: 'mock-tag-1', company_id: MOCK_COMPANY_ID, name: 'VIP', color: '#f59e0b', created_at: d(60) },
  { id: 'mock-tag-2', company_id: MOCK_COMPANY_ID, name: 'Urgente', color: '#ef4444', created_at: d(60) },
  { id: 'mock-tag-3', company_id: MOCK_COMPANY_ID, name: 'Enterprise', color: '#8b5cf6', created_at: d(45) },
  { id: 'mock-tag-4', company_id: MOCK_COMPANY_ID, name: 'Indicação', color: '#10b981', created_at: d(30) },
];
