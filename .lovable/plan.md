# Remoção do módulo "medical"

O módulo está bem mais entrelaçado no CRM do que parece — não é só uma pasta isolada. Antes de sair apagando, precisamos alinhar o escopo, porque parte do que aparece como "medical" hoje é usado por telas do CRM principal (Pipelines, Contatos, Financeiro, Settings/Profissionais).

## 1. Deleção direta (arquivos exclusivamente do módulo)

- `src/components/medical/**` (dashboard, charts, kpis, insights, doctors, patients, marketing, appointments, layout)
- `src/hooks/medical/**` (useMedicalCatalogs, Doctors, Procedures, Practice, KPIs, DashboardSeries, Insights, CrossInsights, PieBreakdowns)
- `src/contexts/MedicalContext.tsx`
- `src/services/medicalService.ts`
- `src/types/medical.ts`
- `src/components/settings/MedicalVerticalSettings.tsx`
- `src/components/settings/medical/**` (ProceduresManager, InsurancesManager, FacilitiesManager, ImportProceduresDialog, exportProcedures)
- `src/hooks/useLeadMedicalNotes.ts`, `src/hooks/useLeadProcedures.ts`
- `src/components/pipelines/LeadMedicalCard.tsx`, `src/components/pipelines/LeadMedicalFields.tsx`
- `src/components/pipelines/lead-detail-modal/LeadMedicalNotesSection.tsx`
- `src/components/pipelines/lead-detail-modal/LeadMedicalAttachmentsSection.tsx`
- `src/components/pipelines/lead-detail-modal/LeadProceduresSection.tsx`

## 2. Edições para remover referências ao vertical medical

- `src/App.tsx` — remover `MedicalProvider`, lazy `MedicalDashboard`, rota `/medical/dashboard`
- `src/components/layout/AppSidebar.tsx` — remover item "Dashboard Médico", campo `vertical`, filtro `companyVertical`, ramificação `brand.isMedical`
- `src/components/layout/RouteSuspenseFallback.tsx` — remover check `/medical/dashboard`
- `src/pages/Settings.tsx` — remover imports/tabs de Convênios, Procedimentos, Hospitais, MedicalVerticalSettings; remover flag `isMedical`/`medical`
- `src/components/settings/appointments/ProfessionalsSettings.tsx` — colapsar branches `isMedical` (remover campos CRM/council_type/bio quando exclusivos do médico) — manter versão "padrão"
- `src/pages/AdminCompanies.tsx` — remover select de vertical (padrão/medical)
- `src/hooks/useCompanyVertical.ts` — remover (ou retornar sempre 'standard'; melhor: remover e ajustar consumidores)
- `src/hooks/useBrand.ts` — simplificar para sempre retornar marca `zapfy`, remover `isMedical` e `Stethoscope`
- `src/components/auth/BrandMark.tsx` — remover ramificação `isMedical`
- `src/components/crm/CrmLeadCard.tsx` — remover bloco `isMedical` (médico/procedimento) e campos `medical_doctor_name`/`medical_procedure_name`
- `src/hooks/usePipelines.ts` — remover campos e joins `medical_doctor_id`/`medical_procedure_id`/`medical_doctors`/`medical_procedures` do select de leads
- `src/hooks/useRealtimePipeline.ts` — remover subscription em `medical_procedures`
- `src/hooks/useReportsRealtime.ts` — remover referências medical
- `src/hooks/useAppointmentProfessionals.ts` — remover campo `medical_doctor_id`
- `src/hooks/useLeadAttachments.ts` — remover categoria `'medical'` (manter apenas `'general'`)
- `src/hooks/useLeads.ts`, `src/hooks/useContacts.ts` — remover campos `medical_*`/`medical_patient_id` do tipo/select
- `src/components/contacts/ContactDrawer.tsx` — remover aba "Clínico"
- `src/components/financeiro/BudgetDetailDrawer.tsx` — remover uso de `useMedicalInsurances` (o seletor de convênio some)
- `src/components/pipelines/lead-detail-modal/LeadDetailModal.tsx` e `LeadInfoSection.tsx` — remover as seções médicas removidas
- `src/pages/pipelines/usePipelineFilters.ts`, `PipelinesHeader.tsx`, `PipelineFilterPanel.tsx` — remover filtros médicos

## 3. O que **não** vou tocar (fora de escopo pedido)

- **Nenhuma migration do Supabase será deletada.** Você pediu para só remover tabelas exclusivas do módulo, mas várias tabelas "medical_*" estão referenciadas por FKs em tabelas centrais do CRM (`leads.medical_doctor_id`, `leads.medical_procedure_id`, `contacts.medical_patient_id`, `lead_procedures.medical_procedure_id`, `appointment_professionals.medical_doctor_id`, `financial_entries` via convênios, etc). Dropar essas tabelas exige uma migration cuidadosa que também remove as colunas/FKs dependentes. Recomendo tratar isso numa etapa 2 dedicada, depois que o frontend estiver limpo e você confirmar que não há dados em produção que dependam disso. Se você topar, faço a migration no próximo passo.
- Edge functions em `supabase/functions/` que mencionem `medical_*` — mesmo motivo: só removo depois de decidirmos a migration.

## 4. Verificação final

Após as edições:
- `rg -n "medical|Medical" src/` para garantir 0 referências residuais no frontend
- `tsgo` (typecheck) para pegar imports quebrados

## Detalhes técnicos

Impacto principal: `useCompanyVertical` some, então todo consumidor precisa assumir vertical padrão. Isso é o gatilho da maior parte das edições em cascata (CrmLeadCard, ContactDrawer, Settings, ProfessionalsSettings, BrandMark, AppSidebar). O tipo `Lead`/`Contact` perde os campos `medical_*` — os selects Supabase precisam ser atualizados junto, senão o PostgREST devolve erro em runtime mesmo com o TS passando.

Confirma esse escopo? Em especial: (a) posso simplificar `ProfessionalsSettings` para a versão "padrão" (perde CRM/conselho/bio), e (b) devo deixar as tabelas `medical_*` no banco por enquanto?
