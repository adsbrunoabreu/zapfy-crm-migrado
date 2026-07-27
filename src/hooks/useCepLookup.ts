import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { fetchAddressByCep, type ViaCepResult } from '@/lib/viacep';

export interface CepFields {
  address: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface Options {
  /** Show toast on error / not-found. Defaults to true. */
  silent?: boolean;
}

/**
 * Centraliza a chamada ao ViaCEP com:
 *  - estado de carregamento
 *  - tratamento de erro de rede e CEP não encontrado (toast padronizado)
 *  - retorno normalizado de campos
 *
 * Use junto com `<CepInput />` ou diretamente via `lookup(cep)`.
 */
export function useCepLookup(opts: Options = {}) {
  const { silent = false } = opts;
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (cep: string): Promise<CepFields | null> => {
    const digits = (cep || '').replace(/\D/g, '');
    if (digits.length !== 8) return null;
    setLoading(true);
    try {
      const res: ViaCepResult | null = await fetchAddressByCep(digits);
      if (!res) {
        if (!silent) toast.error('CEP não encontrado');
        return null;
      }
      return {
        address: res.address || res.logradouro || '',
        neighborhood: res.neighborhood || res.bairro || '',
        city: res.city || res.localidade || '',
        state: res.state || res.uf || '',
      };
    } catch {
      if (!silent) toast.error('Erro ao consultar CEP');
      return null;
    } finally {
      setLoading(false);
    }
  }, [silent]);

  return { loading, lookup };
}
