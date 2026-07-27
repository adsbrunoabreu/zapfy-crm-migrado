// Serviço de fila para busca de fotos de perfil com controle de concorrência
import { evolutionApi } from './evolutionApi';

interface PhotoRequest {
  number: string
  resolve: (url: string | null) => void
}

class PhotoQueueService {
  private queue: PhotoRequest[] = []
  private inFlight = new Set<string>()
  private cache = new Map<string, string | null>()
  private readonly MAX_CONCURRENT = 3
  private readonly BATCH_DELAY_MS = 300
  private timer: ReturnType<typeof setTimeout> | null = null

  /** Busca foto com controle de concorrência e cache */
  request(number: string): Promise<string | null> {
    // Cache hit
    if (this.cache.has(number)) {
      return Promise.resolve(this.cache.get(number)!)
    }

    return new Promise((resolve) => {
      this.queue.push({ number, resolve })
      this.scheduleFlush()
    })
  }

  /** Verifica se há cache para um número */
  getCached(number: string): string | null | undefined {
    return this.cache.get(number)
  }

  /** Define cache manualmente (ex: quando vem do DB) */
  setCache(number: string, url: string | null): void {
    this.cache.set(number, url)
  }

  /** Limpa fila pendente e cache. Use no logout para parar requisições em voo. */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    // Resolve pending requests with null to liberar promises
    for (const req of this.queue) req.resolve(null)
    this.queue = []
    this.inFlight.clear()
    this.cache.clear()
  }

  private scheduleFlush(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, this.BATCH_DELAY_MS)
  }


  private flush(): void {
    const available = this.MAX_CONCURRENT - this.inFlight.size
    if (available <= 0) {
      this.scheduleFlush()
      return
    }

    // Deduplicar por número, mantendo todas as promises
    const byNumber = new Map<string, PhotoRequest[]>()
    const toProcess: string[] = []

    for (const req of this.queue) {
      // Pular se já está em voo ou no cache
      if (this.inFlight.has(req.number)) {
        if (!byNumber.has(req.number)) byNumber.set(req.number, [])
        byNumber.get(req.number)!.push(req)
        continue
      }
      if (this.cache.has(req.number)) {
        req.resolve(this.cache.get(req.number)!)
        continue
      }
      if (!byNumber.has(req.number)) {
        byNumber.set(req.number, [])
        toProcess.push(req.number)
      }
      byNumber.get(req.number)!.push(req)
    }

    this.queue = []

    // Processar apenas até o limite de concorrência
    const batch = toProcess.slice(0, available)
    const remaining = toProcess.slice(available)

    // Re-enfileirar os que não couberam
    for (const num of remaining) {
      for (const req of byNumber.get(num) || []) {
        this.queue.push(req)
      }
    }

    for (const number of batch) {
      this.inFlight.add(number)
      this.fetchPhoto(number).then(url => {
        this.cache.set(number, url)
        this.inFlight.delete(number)
        // Resolver todos que esperavam por este número
        for (const req of byNumber.get(number) || []) {
          req.resolve(url)
        }
        // Continuar se houver fila
        if (this.queue.length > 0) this.scheduleFlush()
      })
    }
  }

  private async fetchPhoto(number: string): Promise<string | null> {
    try {
      const remoteJid = number.includes('@') ? number : `${number}@s.whatsapp.net`
      const res = await evolutionApi.getProfilePicture(remoteJid)
      return res?.profilePictureUrl || res?.profilePicUrl || res?.picture || null
    } catch {
      // Silencioso — falhas são comuns (sem foto, JID inválido, logout, rate limit).
      // O cache armazena null em flush() para evitar retry.
      return null
    }
  }
}


export const photoQueue = new PhotoQueueService()
