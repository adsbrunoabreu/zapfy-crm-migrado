// Utilitário de retry com backoff exponencial para chamadas à Evolution API

interface RetryOptions {
  maxAttempts?: number       // padrão: 3
  initialDelayMs?: number    // padrão: 1000
  maxDelayMs?: number        // padrão: 10000
  factor?: number            // padrão: 2
  shouldRetry?: (error: unknown, attempt: number) => boolean
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    factor = 2,
    shouldRetry = (_, attempt) => attempt < maxAttempts,
    onRetry,
  } = options

  let lastError: unknown
  let delay = initialDelayMs

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Não retenta erros de validação (4xx exceto 429)
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status
        if (status >= 400 && status < 500 && status !== 429) {
          throw error
        }
      }

      if (!shouldRetry(error, attempt)) throw error
      if (attempt === maxAttempts) break

      const jitter = Math.random() * 200
      const waitTime = Math.min(delay + jitter, maxDelayMs)

      onRetry?.(attempt, waitTime, error)
      console.warn(`[EvolutionAPI] Tentativa ${attempt} falhou. Retry em ${Math.round(waitTime)}ms...`)

      await new Promise(resolve => setTimeout(resolve, waitTime))
      delay = Math.min(delay * factor, maxDelayMs)
    }
  }

  throw lastError
}
