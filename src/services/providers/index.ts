/**
 * Registry de providers de WhatsApp.
 *
 * Atualmente expõe apenas a base. Conforme as implementações concretas
 * (`EvolutionProvider`, `CloudApiProvider`) forem adicionadas, basta
 * registrá-las aqui via `ProviderRegistry.register(...)` ou no map estático.
 *
 * Uso:
 *   const provider = ProviderRegistry.create('evolution');
 *   await provider.connect(credentials);
 */

import {
  BaseProvider,
  ProviderError,
  type IWhatsAppProvider,
} from './baseProvider';
import { EvolutionProvider } from './evolutionProvider';
import { CloudAPIProvider } from './cloudAPIProvider';
import type { ProviderType } from '@/types/providers';

export { BaseProvider, ProviderError, EvolutionProvider, CloudAPIProvider };
export type { IWhatsAppProvider };

/** Construtor de um provider sem argumentos (credenciais entram via connect). */
export type ProviderFactory = () => IWhatsAppProvider;

/** Registry estático (singleton implícito). */
export class ProviderRegistry {
  private static factories = new Map<ProviderType, ProviderFactory>();

  /** Registra (ou substitui) o factory de um provider. */
  static register(type: ProviderType, factory: ProviderFactory): void {
    this.factories.set(type, factory);
  }

  /** Cria uma nova instância do provider solicitado. */
  static create(type: ProviderType): IWhatsAppProvider {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new ProviderError(
        `Provider "${type}" não está registrado.`,
        type,
        'PROVIDER_NOT_REGISTERED',
      );
    }
    return factory();
  }

  /** Lista os providers atualmente disponíveis. */
  static getAvailableProviders(): ProviderType[] {
    return Array.from(this.factories.keys());
  }

  /** Verifica se um provider está disponível. */
  static has(type: ProviderType): boolean {
    return this.factories.has(type);
  }
}

// Auto-registro dos providers built-in
ProviderRegistry.register('evolution', () => new EvolutionProvider());
ProviderRegistry.register('cloud_api', () => new CloudAPIProvider());
