import { useMedical } from '@/contexts/MedicalContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Seletor de practice — visível apenas para master. */
export function PracticeSwitcher() {
  const { isMaster, allPractices, currentPractice, setPractice } = useMedical();
  if (!isMaster) return null;
  if (allPractices.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        Nenhuma clínica cadastrada
      </span>
    );
  }
  return (
    <Select
      value={currentPractice?.id ?? ''}
      onValueChange={(id) => {
        const p = allPractices.find((x) => x.id === id) ?? null;
        setPractice(p);
      }}
    >
      <SelectTrigger className="w-[260px] h-9">
        <SelectValue placeholder="Selecionar clínica" />
      </SelectTrigger>
      <SelectContent>
        {allPractices.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            🏥 {p.practice_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
