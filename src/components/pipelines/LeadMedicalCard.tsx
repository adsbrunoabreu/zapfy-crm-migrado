/**
 * Card "Dados do Médico" exibido no drawer da oportunidade
 * apenas para empresas com vertical 'medical'.
 *
 * Quatro selects, todos alimentados por catálogos cadastrados em
 * Settings › Vertical Médica: Médico, Convênio, Hospital/Clínica e
 * Procedimento.
 */
import { Stethoscope } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useMedicalDoctors } from '@/hooks/medical/useMedicalDoctors';
import { useMedicalProcedures } from '@/hooks/medical/useMedicalProcedures';
import { useMedicalInsurances, useMedicalFacilities } from '@/hooks/medical/useMedicalCatalogs';
import { useMedical } from '@/contexts/MedicalContext';

type MedicalField =
  | 'medical_doctor_id'
  | 'medical_procedure_id'
  | 'insurance_id'
  | 'facility_id'
  | 'insurance_card_number';

interface Props {
  values: {
    medical_doctor_id: string | null;
    medical_procedure_id: string | null;
    insurance_id: string | null;
    facility_id: string | null;
    insurance_card_number?: string | null;
  };
  onChange: (field: MedicalField, value: string | null) => void;
  /** Oculta o select de procedimento (quando a tela já usa multi-procedimentos). */
  hideProcedure?: boolean;
  /** Desabilita todos os selects (ex.: lead encerrado). */
  disabled?: boolean;
}

export function LeadMedicalCard({ values, onChange, hideProcedure = false, disabled = false }: Props) {

  const { currentPractice } = useMedical();
  const practiceId = currentPractice?.id ?? null;
  const { data: doctors = [] } = useMedicalDoctors(practiceId);
  const { data: procedures = [] } = useMedicalProcedures(practiceId);
  const { data: insurances = [] } = useMedicalInsurances({ onlyActive: true });
  const { data: facilities = [] } = useMedicalFacilities({ onlyActive: true });

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Stethoscope className="w-4 h-4 text-muted-foreground" />
        Dados do Médico
      </h4>

      <div className="grid grid-cols-2 gap-4">
        {/* Médico */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Médico responsável</Label>
          <SearchableSelect
            value={values.medical_doctor_id || ''}
            onValueChange={(v) => onChange('medical_doctor_id', v || null)}
            disabled={disabled}
            options={doctors.map((d) => ({ value: d.id, label: d.full_name }))}
            placeholder={doctors.length === 0 ? 'Cadastre em Configurações › Vertical Médica' : 'Selecione'}
            searchPlaceholder="Buscar médico..."
            emptyText="Nenhum médico encontrado."
            allowClear
          />
        </div>

        {/* Convênio */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Convênio / Particular</Label>
          <SearchableSelect
            value={values.insurance_id || ''}
            onValueChange={(v) => onChange('insurance_id', v || null)}
            disabled={disabled}
            options={insurances.map((i) => ({ value: i.id, label: i.name }))}
            placeholder={insurances.length === 0 ? 'Cadastre em Configurações › Vertical Médica' : 'Selecione'}
            searchPlaceholder="Buscar convênio..."
            emptyText="Nenhum convênio encontrado."
            allowClear
          />
        </div>

        {/* Carteirinha (alfanumérico) */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nº da carteirinha</Label>
          <Input
            value={values.insurance_card_number ?? ''}
            onChange={(e) => {
              const sanitized = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
              onChange('insurance_card_number', sanitized || null);
            }}
            disabled={disabled}
            placeholder="Apenas letras e números"
            inputMode="text"
            autoComplete="off"
            className="h-9"
          />
        </div>

        {/* Hospital / Clínica */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Hospital / Clínica</Label>
          <SearchableSelect
            value={values.facility_id || ''}
            onValueChange={(v) => onChange('facility_id', v || null)}
            disabled={disabled}
            options={facilities.map((f) => ({
              value: f.id,
              label: f.name,
              hint: f.city ? `${f.city}${f.state ? '/' + f.state : ''}` : undefined,
            }))}
            placeholder={facilities.length === 0 ? 'Cadastre em Configurações › Vertical Médica' : 'Selecione'}
            searchPlaceholder="Buscar hospital ou clínica..."
            emptyText="Nenhum item encontrado."
            allowClear
          />
        </div>

        {/* Procedimento (oculto quando hideProcedure=true) */}
        {!hideProcedure && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Procedimento</Label>
            <SearchableSelect
              value={values.medical_procedure_id || ''}
              onValueChange={(v) => onChange('medical_procedure_id', v || null)}
              disabled={disabled}
              options={procedures.map((p) => ({ value: p.id, label: p.name }))}
              placeholder={procedures.length === 0 ? 'Cadastre em Configurações › Vertical Médica' : 'Selecione'}
              searchPlaceholder="Buscar procedimento..."
              emptyText="Nenhum procedimento encontrado."
              allowClear
            />
          </div>
        )}
      </div>
    </section>
  );
}

