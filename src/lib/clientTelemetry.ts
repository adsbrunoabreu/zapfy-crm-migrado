import { supabase } from '@/integrations/supabase/client';

type Level = 'info' | 'warn' | 'error';

interface LogArgs {
  event: string;
  message: string;
  level?: Level;
  metadata?: Record<string, unknown>;
  companyId?: string | null;
}

// Dedupe: evita spam do mesmo erro em loops de render
const recent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;
const MAX_PER_SESSION = 50;
let sentCount = 0;

// Contexto atual (setado pelo AuthContext quando o usuário carrega)
let ctx: { userId?: string | null; companyId?: string | null; role?: string | null } = {};

export function setTelemetryContext(next: { userId?: string | null; companyId?: string | null; role?: string | null }) {
  ctx = { ...ctx, ...next };
}

function shouldSend(key: string): boolean {
  if (sentCount >= MAX_PER_SESSION) return false;
  const now = Date.now();
  const last = recent.get(key) ?? 0;
  if (now - last < DEDUPE_WINDOW_MS) return false;
  recent.set(key, now);
  // prune
  if (recent.size > 100) {
    for (const [k, t] of recent) if (now - t > DEDUPE_WINDOW_MS) recent.delete(k);
  }
  return true;
}

export async function logClientEvent({ event, message, level = 'error', metadata, companyId }: LogArgs): Promise<void> {
  const cid = companyId ?? ctx.companyId;
  if (!cid) return; // system_logs exige company_id
  const key = `${event}:${message.slice(0, 120)}`;
  if (!shouldSend(key)) return;
  sentCount++;
  try {
    await supabase.from('system_logs').insert([
      {
        company_id: cid,
        source: 'frontend',
        level,
        event,
        message: message.slice(0, 500),
        metadata: {
          ...(metadata ?? {}),
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          user_id: ctx.userId ?? undefined,
          role: ctx.role ?? undefined,
        } as never,
      },
    ]);
  } catch (e) {
    console.warn('[client-telemetry] failed', e);
  }
}

let installed = false;
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (ev) => {
    // ignora erros de recursos (img/script load) — só JS
    if (!(ev.error instanceof Error) && !ev.message) return;
    const err = ev.error as Error | undefined;
    void logClientEvent({
      event: 'window.error',
      message: err?.message || ev.message || 'unknown error',
      metadata: {
        stack: err?.stack?.slice(0, 2000),
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
        ? reason
        : (() => {
            try { return JSON.stringify(reason); } catch { return String(reason); }
          })();
    void logClientEvent({
      event: 'unhandledrejection',
      message: (message || 'unknown rejection').slice(0, 500),
      metadata: {
        stack: reason instanceof Error ? reason.stack?.slice(0, 2000) : undefined,
      },
    });
  });
}
