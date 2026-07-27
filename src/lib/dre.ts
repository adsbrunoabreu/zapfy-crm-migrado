// DRE — estrutura, agregações e helpers de export

export type DreSection =
  | 'receita_consultas' | 'receita_procedimentos' | 'receita_cirurgias'
  | 'receita_memberships' | 'receita_convenios' | 'receita_particular' | 'receita_outros'
  | 'deducao_glosas' | 'deducao_cancelamentos' | 'deducao_estornos' | 'deducao_descontos'
  | 'custo_comissao_medica' | 'custo_materiais' | 'custo_laboratorio' | 'custo_equipamentos'
  | 'custo_apis' | 'custo_infraestrutura' | 'custo_whatsapp' | 'custo_ia'
  | 'despesa_administrativo' | 'despesa_comercial' | 'despesa_marketing' | 'despesa_rh'
  | 'despesa_tecnologia' | 'despesa_atendimento' | 'despesa_financeiro'
  | 'resultado_juros' | 'resultado_tarifas' | 'resultado_iof' | 'resultado_antecipacao'
  | 'impostos';

export const DRE_LABEL: Record<DreSection, string> = {
  receita_consultas: 'Consultas',
  receita_procedimentos: 'Procedimentos',
  receita_cirurgias: 'Cirurgias',
  receita_memberships: 'Memberships',
  receita_convenios: 'Convênios',
  receita_particular: 'Particular',
  receita_outros: 'Outras receitas',
  deducao_glosas: 'Glosas',
  deducao_cancelamentos: 'Cancelamentos',
  deducao_estornos: 'Estornos',
  deducao_descontos: 'Descontos',
  custo_comissao_medica: 'Comissão médica',
  custo_materiais: 'Materiais',
  custo_laboratorio: 'Laboratório',
  custo_equipamentos: 'Equipamentos',
  custo_apis: 'APIs',
  custo_infraestrutura: 'Infraestrutura',
  custo_whatsapp: 'WhatsApp',
  custo_ia: 'Inteligência Artificial',
  despesa_administrativo: 'Administrativo',
  despesa_comercial: 'Comercial',
  despesa_marketing: 'Marketing',
  despesa_rh: 'RH',
  despesa_tecnologia: 'Tecnologia',
  despesa_atendimento: 'Atendimento',
  despesa_financeiro: 'Financeiro',
  resultado_juros: 'Juros',
  resultado_tarifas: 'Tarifas bancárias',
  resultado_iof: 'IOF',
  resultado_antecipacao: 'Antecipações',
  impostos: 'Impostos sobre o lucro',
};

export type DreGroup =
  | 'receita_bruta' | 'deducoes' | 'custos_diretos'
  | 'despesas_operacionais' | 'resultado_financeiro' | 'impostos_grp';

export const GROUP_LABEL: Record<DreGroup, string> = {
  receita_bruta: 'RECEITA BRUTA',
  deducoes: '(-) DEDUÇÕES',
  custos_diretos: '(-) CUSTOS DIRETOS',
  despesas_operacionais: '(-) DESPESAS OPERACIONAIS',
  resultado_financeiro: '(-) RESULTADO FINANCEIRO',
  impostos_grp: '(-) IMPOSTOS',
};

export const GROUP_SECTIONS: Record<DreGroup, DreSection[]> = {
  receita_bruta: ['receita_consultas','receita_procedimentos','receita_cirurgias','receita_memberships','receita_convenios','receita_particular','receita_outros'],
  deducoes: ['deducao_glosas','deducao_cancelamentos','deducao_estornos','deducao_descontos'],
  custos_diretos: ['custo_comissao_medica','custo_materiais','custo_laboratorio','custo_equipamentos','custo_apis','custo_infraestrutura','custo_whatsapp','custo_ia'],
  despesas_operacionais: ['despesa_administrativo','despesa_comercial','despesa_marketing','despesa_rh','despesa_tecnologia','despesa_atendimento','despesa_financeiro'],
  resultado_financeiro: ['resultado_juros','resultado_tarifas','resultado_iof','resultado_antecipacao'],
  impostos_grp: ['impostos'],
};

export const GROUP_ORDER: DreGroup[] = [
  'receita_bruta','deducoes','custos_diretos','despesas_operacionais','resultado_financeiro','impostos_grp',
];

export type DreSectionsMap = Partial<Record<DreSection, number>>;
export type DreCategoryRow = { section: DreSection; category_id: string; category_name: string; total: number; qty: number };

export type DreReport = {
  period: { start: string; end: string; basis: 'competencia' | 'caixa' };
  sections: DreSectionsMap;
  categories: DreCategoryRow[];
};

export function sumGroup(sections: DreSectionsMap, group: DreGroup): number {
  return GROUP_SECTIONS[group].reduce((s, k) => s + Number(sections[k] ?? 0), 0);
}

export type DreTotals = {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  lucroBruto: number;
  despesas: number;
  ebitda: number;
  resultadoFinanceiro: number;
  lucroAntesImpostos: number;
  impostos: number;
  lucroLiquido: number;
  margemBruta: number;
  margemEbitda: number;
  margemLiquida: number;
};

export function computeTotals(sections: DreSectionsMap): DreTotals {
  const receitaBruta = sumGroup(sections, 'receita_bruta');
  const deducoes = sumGroup(sections, 'deducoes');
  const receitaLiquida = receitaBruta - deducoes;
  const custos = sumGroup(sections, 'custos_diretos');
  const lucroBruto = receitaLiquida - custos;
  const despesas = sumGroup(sections, 'despesas_operacionais');
  const ebitda = lucroBruto - despesas;
  const resultadoFinanceiro = sumGroup(sections, 'resultado_financeiro');
  const lucroAntesImpostos = ebitda - resultadoFinanceiro;
  const impostos = sumGroup(sections, 'impostos_grp');
  const lucroLiquido = lucroAntesImpostos - impostos;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  return {
    receitaBruta, deducoes, receitaLiquida, custos, lucroBruto, despesas, ebitda,
    resultadoFinanceiro, lucroAntesImpostos, impostos, lucroLiquido,
    margemBruta: pct(lucroBruto, receitaBruta),
    margemEbitda: pct(ebitda, receitaBruta),
    margemLiquida: pct(lucroLiquido, receitaBruta),
  };
}
