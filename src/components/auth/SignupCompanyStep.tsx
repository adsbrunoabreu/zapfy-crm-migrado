import { CompanyProfileForm, type CompanyProfileValues } from '@/components/admin/CompanyProfileForm';

interface Props {
  value: CompanyProfileValues;
  onChange: (v: CompanyProfileValues) => void;
}

export function SignupCompanyStep({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Preencha os dados da sua empresa para concluir o cadastro.
      </p>
      <CompanyProfileForm value={value} onChange={onChange} />
    </div>
  );
}
