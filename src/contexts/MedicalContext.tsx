import { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAuth } from '@/contexts/AuthContext';
import { useMyMedicalPractice, useAllMedicalPractices } from '@/hooks/medical/useMedicalPractice';
import type { MedicalPractice } from '@/types/medical';

interface MedicalContextType {
  currentPractice: MedicalPractice | null;
  isMedicalMode: boolean;
  isMaster: boolean;
  allPractices: MedicalPractice[];
  setPractice: (practice: MedicalPractice | null) => void;
  loading: boolean;
}

const MedicalContext = createContext<MedicalContextType | undefined>(undefined);

export function MedicalProvider({ children }: { children: React.ReactNode }) {
  const { profile, isMaster } = useAuth();
  const companyId = profile?.company_id ?? null;

  // Cache de seleção do master entre sessões
  const [masterSelectedId, setMasterSelectedId] = usePersistedState<string | null>(
    'medical_practice_id',
    null,
  );

  const { data: myPractice, isLoading: loadingMine } = useMyMedicalPractice(companyId);
  const { data: allPractices = [], isLoading: loadingAll } = useAllMedicalPractices(isMaster);

  const currentPractice = useMemo<MedicalPractice | null>(() => {
    if (isMaster) {
      if (!masterSelectedId) return allPractices[0] ?? null;
      return allPractices.find((p) => p.id === masterSelectedId) ?? allPractices[0] ?? null;
    }
    return myPractice ?? null;
  }, [isMaster, masterSelectedId, allPractices, myPractice]);

  // Sincroniza ID persistido com o que está realmente disponível
  useEffect(() => {
    if (isMaster && currentPractice && currentPractice.id !== masterSelectedId) {
      setMasterSelectedId(currentPractice.id);
    }
  }, [isMaster, currentPractice, masterSelectedId, setMasterSelectedId]);

  const setPractice = useCallback(
    (practice: MedicalPractice | null) => {
      setMasterSelectedId(practice?.id ?? null);
    },
    [setMasterSelectedId],
  );

  const value: MedicalContextType = {
    currentPractice,
    isMedicalMode: !!currentPractice,
    isMaster,
    allPractices,
    setPractice,
    loading: loadingMine || (isMaster && loadingAll),
  };

  return <MedicalContext.Provider value={value}>{children}</MedicalContext.Provider>;
}

export function useMedical() {
  const context = useContext(MedicalContext);
  if (!context) throw new Error('useMedical deve ser usado dentro de MedicalProvider');
  return context;
}
